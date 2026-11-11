import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { ensureUserSettingsSchema, getDb } from "../../../db";
import {
  accountGoals,
  accounts,
  budgets,
  categories,
  categoryKeywords,
  fixedExpenseKeywordSources,
  fixedExpensePayments,
  fixedExpenseSkips,
  fixedExpenseMonthAmounts,
  fixedExpenses,
  keywordBlacklists,
  transactions,
  userSettings,
} from "../../../db/schema";
import { normalizeKeyword, normalizeKeywords } from "../../../lib/keyword-policy";
import { getBank } from "../../../lib/banks";
import { isMonthKey } from "../../../lib/fixed-expense-amount";
import { isSupply } from "../../../lib/energy-providers";

const BACKUP_VERSION = 1;
const now = () => new Date().toISOString();
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const optStr = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const validType = (value: unknown) => (["personale", "risparmi", "spese_mese"].includes(String(value)) ? String(value) : "personale");
const normalizedDescription = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const duplicateKey = (accountId: number, date: string, amount: number, description: string, externalId: string | null) =>
  externalId ? `${accountId}|ext|${externalId}` : `${accountId}|${date}|${amount.toFixed(2)}|${normalizedDescription(description)}`;

// D1 accetta al massimo 100 parametri per query e ogni chiamata conta come subrequest: raggruppiamo in batch.
async function runBatches<T>(db: ReturnType<typeof getDb>, statements: any[], size = 10): Promise<T[][]> {
  const results: T[][] = [];
  for (let index = 0; index < statements.length; index += size) {
    const part = statements.slice(index, index + size);
    if (part.length) results.push(...((await (db as any).batch(part)) as T[][]));
  }
  return results;
}
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  const db = getDb();
  const owner = user.email;
  const [accountRows, transactionRows, categoryRows, keywordRows, expenseRows, sourceRows, paymentRows, skipRows, budgetRows, goalRows, blacklistRows, settingsRows, monthAmountRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerEmail, owner)),
    db.select().from(transactions).where(eq(transactions.ownerEmail, owner)),
    db.select().from(categories).where(eq(categories.ownerEmail, owner)),
    db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, owner)),
    db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, owner)),
    db.select().from(fixedExpenseKeywordSources).where(eq(fixedExpenseKeywordSources.ownerEmail, owner)),
    db.select().from(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, owner)),
    db.select().from(fixedExpenseSkips).where(eq(fixedExpenseSkips.ownerEmail, owner)),
    db.select().from(budgets).where(eq(budgets.ownerEmail, owner)),
    db.select().from(accountGoals).where(eq(accountGoals.ownerEmail, owner)),
    db.select().from(keywordBlacklists).where(eq(keywordBlacklists.ownerEmail, owner)),
    db.select().from(userSettings).where(eq(userSettings.ownerEmail, owner)).limit(1),
    db.select().from(fixedExpenseMonthAmounts).where(eq(fixedExpenseMonthAmounts.ownerEmail, owner)),
  ]);
  const payload = {
    app: "conti-in-chiaro",
    version: BACKUP_VERSION,
    exportedAt: now(),
    homeAccountId: settingsRows[0]?.homeAccountId ?? null,
    accounts: accountRows.map(({ ownerEmail: _o, ...row }) => row),
    accountGoals: goalRows.map(({ ownerEmail: _o, ...row }) => row),
    categories: categoryRows.map((row) => ({
      name: row.name,
      color: row.color,
      keywords: keywordRows.filter((keyword) => keyword.categoryId === row.id).map((keyword) => ({ keyword: keyword.keyword, source: keyword.source })),
    })),
    transactions: transactionRows.map(({ ownerEmail: _o, fingerprint: _f, ...row }) => row),
    fixedExpenses: expenseRows.map(({ ownerEmail: _o, ...row }) => ({
      ...row,
      keywordSources: sourceRows.filter((source) => source.fixedExpenseId === row.id).map((source) => ({ keyword: source.keyword, source: source.source })),
    })),
    fixedExpensePayments: paymentRows.map(({ ownerEmail: _o, ...row }) => row),
    fixedExpenseSkips: skipRows.map(({ ownerEmail: _o, ...row }) => row),
    fixedExpenseMonthAmounts: monthAmountRows.map(({ ownerEmail: _o, id: _i, ...row }) => row),
    budgets: budgetRows.map(({ ownerEmail: _o, id: _i, ...row }) => row),
    keywordBlacklists: blacklistRows.map(({ ownerEmail: _o, id: _i, ...row }) => row),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="conti-in-chiaro-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  let data: Record<string, any>;
  try { data = (await request.json()) as Record<string, any>; } catch { return Response.json({ error: "File non valido" }, { status: 400 }); }
  if (data?.app !== "conti-in-chiaro" || data.version !== BACKUP_VERSION)
    return Response.json({ error: "Il file non è un backup valido di Conti in Chiaro" }, { status: 400 });

  const db = getDb();
  const owner = user.email;
  const stats = { accounts: 0, transactions: 0, duplicateTransactions: 0, categories: 0, fixedExpenses: 0 };

  // --- Conti: riusa quelli con stesso nome e tipo, crea gli altri
  const existingAccounts = await db.select().from(accounts).where(eq(accounts.ownerEmail, owner));
  const accountMap = new Map<number, number>();
  const newAccounts: any[] = [];
  for (const item of asArray(data.accounts)) {
    const oldId = num(item?.id), name = str(item?.name).trim();
    if (oldId === null || !name) continue;
    const type = validType(item.type);
    const match = existingAccounts.find((account) => account.name === name && account.type === type);
    if (match) accountMap.set(oldId, match.id);
    else newAccounts.push({ oldId, values: { ownerEmail: owner, name, color: str(item.color, "#173f35"), type, bank: getBank(item.bank)?.id ?? null, createdAt: str(item.createdAt, now()) } });
  }
  const accountResults = await runBatches<{ id: number }>(db, newAccounts.map((item) => db.insert(accounts).values(item.values).returning({ id: accounts.id })), 20);
  accountResults.forEach((rows, index) => { if (rows[0]) { accountMap.set(newAccounts[index].oldId, rows[0].id); stats.accounts++; } });

  // --- Obiettivi, conto in home
  for (const goal of asArray(data.accountGoals)) {
    const accountId = accountMap.get(Number(goal?.accountId)), amount = num(goal?.amount);
    if (accountId && amount !== null)
      await db.insert(accountGoals).values({ accountId, ownerEmail: owner, amount }).onConflictDoNothing();
  }
  const homeId = accountMap.get(Number(data.homeAccountId));
  if (homeId) await db.insert(userSettings).values({ ownerEmail: owner, homeAccountId: homeId }).onConflictDoNothing();

  // --- Categorie e parole chiave
  const existingCategories = await db.select().from(categories).where(eq(categories.ownerEmail, owner));
  const categoryIds = new Map(existingCategories.map((row) => [row.name, row.id]));
  const categoryItems = asArray(data.categories).filter((item) => str(item?.name).trim());
  const missingCategories = categoryItems.filter((item) => !categoryIds.has(str(item.name).trim()));
  await runBatches(db, missingCategories.map((item) => db.insert(categories).values({ ownerEmail: owner, name: str(item.name).trim(), color: str(item.color, "#4e8d7c"), createdAt: now() }).onConflictDoNothing()), 20);
  stats.categories = missingCategories.length;
  for (const row of await db.select().from(categories).where(eq(categories.ownerEmail, owner))) categoryIds.set(row.name, row.id);
  const keywordValues = categoryItems.flatMap((item) => {
    const categoryId = categoryIds.get(str(item.name).trim());
    if (!categoryId) return [];
    return asArray(item.keywords).map((entry) => ({ ownerEmail: owner, categoryId, keyword: normalizeKeyword(entry?.keyword), source: str(entry?.source, "manual") })).filter((entry) => entry.keyword);
  });
  await runBatches(db, chunk(keywordValues, 20).map((values) => db.insert(categoryKeywords).values(values).onConflictDoNothing()));
  const blacklistValues = asArray(data.keywordBlacklists)
    .filter((item) => ["category", "fixed_expense"].includes(str(item?.scope)) && normalizeKeyword(item?.keyword))
    .map((item) => ({ ownerEmail: owner, scope: str(item.scope), keyword: normalizeKeyword(item.keyword), source: str(item.source, "manual"), createdAt: str(item.createdAt, now()) }));
  await runBatches(db, chunk(blacklistValues, 15).map((values) => db.insert(keywordBlacklists).values(values).onConflictDoNothing()));
  const budgetValues = asArray(data.budgets).filter((item) => str(item?.month) && num(item?.amount) !== null).map((item) => ({ ownerEmail: owner, month: str(item.month), amount: item.amount as number }));
  await runBatches(db, chunk(budgetValues, 30).map((values) => db.insert(budgets).values(values).onConflictDoNothing()));

  // --- Movimenti (salta quelli già presenti nel database)
  const existingTransactions = await db.select().from(transactions).where(eq(transactions.ownerEmail, owner));
  const existingByExternal = new Map<string, number>();
  for (const row of existingTransactions) if (row.externalTransactionId) existingByExternal.set(duplicateKey(row.accountId, row.date, row.amount, row.description, row.externalTransactionId), row.id);
  // Il confronto avviene solo tra i movimenti già presenti e quelli del file: ogni movimento esistente
  // 'assorbe' al massimo un movimento del file. Movimenti identici dentro il file restano quindi separati.
  const knownKeys = new Map<string, number[]>();
  const addKnown = (key: string, id: number) => { const ids = knownKeys.get(key); if (ids) ids.push(id); else knownKeys.set(key, [id]); };
  for (const row of existingTransactions) {
    addKnown(duplicateKey(row.accountId, row.date, row.amount, row.description, null), row.id);
  }
  const transactionMap = new Map<number, number>();
  const toInsert: Array<{ oldId: number; token: string; values: typeof transactions.$inferInsert }> = [];
  const usedExisting = new Set<number>();
  const takeKnown = (key: string) => { const ids = knownKeys.get(key); return ids?.find((id) => !usedExisting.has(id)); };
  for (const item of asArray(data.transactions)) {
    const oldId = num(item?.id), accountId = accountMap.get(Number(item?.accountId)), amount = num(item?.amount);
    const date = str(item?.date), description = str(item?.description);
    if (oldId === null || !accountId || amount === null || !/^\d{4}-\d{2}-\d{2}/.test(date) || !description) continue;
    const externalId = optStr(item.externalTransactionId);
    const externalMatch = externalId ? existingByExternal.get(duplicateKey(accountId, date, amount, description, externalId)) : undefined;
    const known = (externalMatch !== undefined && !usedExisting.has(externalMatch) ? externalMatch : undefined) ?? takeKnown(duplicateKey(accountId, date, amount, description, null));
    if (known !== undefined && !usedExisting.has(known)) { usedExisting.add(known); transactionMap.set(oldId, known); stats.duplicateTransactions++; continue; }
    const token = crypto.randomUUID();
    toInsert.push({ oldId, token, values: {
      ownerEmail: owner, accountId, date, description, details: optStr(item.details), amount,
      category: str(item.category, "Altro") || "Altro", source: str(item.source, "import"),
      externalTransactionId: externalId, openBankingStatus: optStr(item.openBankingStatus),
      spreadAcrossWeeks: item.spreadAcrossWeeks === true, fingerprint: `backup|${token}`, createdAt: str(item.createdAt, now()),
    } });
  }
  const oldIdByToken = new Map(toInsert.map((item) => [`backup|${item.token}`, item.oldId]));
  const insertedRows = await runBatches<{ id: number; fingerprint: string }>(db,
    chunk(toInsert, 7).map((items) => db.insert(transactions).values(items.map((item) => item.values)).returning({ id: transactions.id, fingerprint: transactions.fingerprint })));
  for (const rows of insertedRows) for (const row of rows) {
    const oldId = oldIdByToken.get(row.fingerprint);
    if (oldId !== undefined) { transactionMap.set(oldId, row.id); stats.transactions++; }
  }

  // --- Spese fisse, pagamenti e salti
  const existingExpenses = await db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, owner));
  const expenseMap = new Map<number, number>();
  const newExpenses: Array<{ oldId: number; sources: any[]; values: typeof fixedExpenses.$inferInsert }> = [];
  for (const item of asArray(data.fixedExpenses)) {
    const oldId = num(item?.id), accountId = accountMap.get(Number(item?.accountId)), amount = num(item?.amount), name = str(item?.name).trim();
    if (oldId === null || !accountId || amount === null || !name) continue;
    const onlyMonth = isMonthKey(item?.onlyMonth) ? item.onlyMonth : null;
    const match = existingExpenses.find((expense) => expense.accountId === accountId && expense.name === name && Math.abs(expense.amount - amount) < 0.005 && (expense.onlyMonth ?? null) === onlyMonth);
    if (match) { expenseMap.set(oldId, match.id); continue; }
    let keywords: string[] = [];
    try { keywords = normalizeKeywords(JSON.parse(str(item.keywords, "[]"))).slice(0, 40); } catch { /* parole chiave non valide */ }
    newExpenses.push({ oldId, sources: asArray(item.keywordSources), values: { ownerEmail: owner, accountId, name, notes: optStr(item.notes), category: optStr(item.category), keywords: JSON.stringify(keywords), amount, active: item.active !== false, variable: item.variable === true, onlyMonth, keywordsFromId: null, supply: isSupply(item.supply) ? item.supply : null, createdAt: str(item.createdAt, now()) } });
  }
  const expenseResults = await runBatches<{ id: number }>(db, newExpenses.map((item) => db.insert(fixedExpenses).values(item.values).returning({ id: fixedExpenses.id })), 20);
  const sourceValues: Array<typeof fixedExpenseKeywordSources.$inferInsert> = [];
  const exportedParents = new Map(asArray(data.fixedExpenses).map((item) => [Number(item?.id), Number(item?.keywordsFromId)] as const));
  expenseResults.forEach((rows, index) => {
    if (!rows[0]) return;
    expenseMap.set(newExpenses[index].oldId, rows[0].id); stats.fixedExpenses++;
    for (const source of newExpenses[index].sources) {
      const keyword = normalizeKeyword(source?.keyword);
      if (keyword) sourceValues.push({ ownerEmail: owner, fixedExpenseId: rows[0].id, keyword, source: str(source?.source, "manual") });
    }
  });
  for (const { oldId } of newExpenses) {
    const newId = expenseMap.get(oldId), oldParent = exportedParents.get(oldId), newParent = oldParent ? expenseMap.get(oldParent) : undefined;
    if (!newId) continue;
    if (newParent && newParent !== newId) await db.update(fixedExpenses).set({ keywordsFromId: newParent }).where(and(eq(fixedExpenses.id, newId), eq(fixedExpenses.ownerEmail, owner)));
  }
  await runBatches(db, chunk(sourceValues, 20).map((values) => db.insert(fixedExpenseKeywordSources).values(values).onConflictDoNothing()));
  const paymentValues = asArray(data.fixedExpensePayments).flatMap((item) => {
    const fixedExpenseId = expenseMap.get(Number(item?.fixedExpenseId)), transactionId = transactionMap.get(Number(item?.transactionId));
    return fixedExpenseId && transactionId && str(item?.month) ? [{ ownerEmail: owner, fixedExpenseId, transactionId, month: str(item.month), createdAt: str(item.createdAt, now()) }] : [];
  });
  await runBatches(db, chunk(paymentValues, 15).map((values) => db.insert(fixedExpensePayments).values(values).onConflictDoNothing()));
  const skipValues = asArray(data.fixedExpenseSkips).flatMap((item) => {
    const fixedExpenseId = expenseMap.get(Number(item?.fixedExpenseId));
    return fixedExpenseId && str(item?.month) ? [{ ownerEmail: owner, fixedExpenseId, month: str(item.month), createdAt: str(item.createdAt, now()) }] : [];
  });
  await runBatches(db, chunk(skipValues, 20).map((values) => db.insert(fixedExpenseSkips).values(values).onConflictDoNothing()));
  const monthAmountValues = asArray(data.fixedExpenseMonthAmounts).flatMap((item) => {
    const fixedExpenseId = expenseMap.get(Number(item?.fixedExpenseId)), amount = num(item?.amount);
    return fixedExpenseId && isMonthKey(item?.month) && amount !== null ? [{ ownerEmail: owner, fixedExpenseId, month: item.month as string, amount, createdAt: str(item.createdAt, now()) }] : [];
  });
  await runBatches(db, chunk(monthAmountValues, 15).map((values) => db.insert(fixedExpenseMonthAmounts).values(values).onConflictDoNothing()));

  return Response.json({ ok: true, ...stats });
}
