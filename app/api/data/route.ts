import { and, desc, eq, gte, inArray, lt, lte, notInArray } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { ensureUserSettingsSchema, getDb } from "../../../db";
import { accountCycleMonth, accountPeriodBounds } from "../../../lib/account-period";
import {
  accounts,
  accountGoals,
  appFlags,
  budgets,
  categories,
  categoryKeywords,
  fixedExpenseKeywordSources,
  fixedExpensePayments,
  fixedExpenseSkips,
  fixedExpenses,
  keywordBlacklists,
  transactions,
  userSettings,
} from "../../../db/schema";
import { automaticKeywordStopWords, normalizeKeyword, normalizeKeywords, type KeywordScope } from "../../../lib/keyword-policy";

const now = () => new Date().toISOString();
const defaultCategories = [
  ["Benzina", "#d96745"],
  ["Spesa", "#e9b44c"],
  ["Tabacco", "#9b7b65"],
  ["Condominio", "#7c74b5"],
  ["Mangiare fuori", "#b06c49"],
  ["Regali", "#db8f74"],
  ["Shopping online", "#3279a8"],
  ["Shopping fisico", "#4e8d7c"],
  ["Farmacia", "#7c74b5"],
  ["Animali", "#3d7f67"],
  ["Bollette", "#d96745"],
  ["Abbonamenti", "#9b7b65"],
  ["Altro", "#7b837e"],
  ["Stipendio", "#3d7f67"],
  ["Rimborso", "#3279a8"],
  ["Ricarica", "#b06c49"],
] as const;
const defaultCategoryKeywords: Record<string, string[]> = {
  Stipendio: ["stipendio", "salary", "emolumenti", "pensione"],
  Benzina: ["benzina", "carburante", "eni", "q8", "tamoil", "ip", "esso"],
  Spesa: ["supermercato", "market", "alimentari", "conad", "coop", "esselunga", "lidl", "carrefour", "eurospin", "todis", "pam", "md spa"],
  Tabacco: ["tabacchi", "tabaccheria", "tabacco", "sigarette"],
  Condominio: ["condominio", "condominiale", "amministratore condominio"],
  "Mangiare fuori": ["ristorante", "pizzeria", "bar", "caffè", "deliveroo", "glovo", "just eat", "mcdonald", "burger king"],
  Regali: ["regalo", "regali", "gift"],
  "Shopping online": ["amazon", "zalando", "ebay", "ecommerce", "online store"],
  "Shopping fisico": ["negozio", "store", "ikea", "leroy merlin", "decathlon"],
  Farmacia: ["farmacia", "parafarmacia", "medicinale"],
  Animali: ["veterinario", "pet shop", "animali", "zooplus", "arcaplanet"],
  Bollette: ["luce", "gas", "acqua", "utenza", "enel", "acea", "internet", "tim", "vodafone", "windtre", "fastweb"],
  Abbonamenti: ["netflix", "spotify", "disney", "abbonamento", "subscription", "playstation", "nintendo"],
};
const cleanKeywords = (value: unknown) => normalizeKeywords(value).slice(0, 40);
const parseFixedExpenseKeywords = (value: unknown) => {
  try { return cleanKeywords(JSON.parse(typeof value === "string" ? value : "[]")); } catch { return []; }
};
const fingerprint = (
  a: number,
  date: string,
  description: string,
  amount: number,
) =>
  `${a}|${date}|${normalizedImportDescription(description)}|${amount.toFixed(2)}|${crypto.randomUUID()}`;
const normalizedImportDescription = (description: string) => description.trim().toLowerCase().replace(/^(?:pagamento|pagamennto)\b[\s\S]*?\bpresso\b[\s\u00a0]*/i, "").replace(/\s+/g, " ");
const transactionSimilarity = (
  left: { description: string; details?: string | null },
  right: { description: string; details?: string | null },
) => {
  const tokens = (item: { description: string; details?: string | null }) => new Set(
    [item.description, item.details].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ").toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 1),
  );
  const leftTokens = tokens(left), rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / Math.min(leftTokens.size, rightTokens.size);
};
const sameTransactionDescription = (
  left: { description?: string | null; details?: string | null },
  right: { description?: string | null; details?: string | null },
) => {
  const field = (value?: string | null) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return field(left.description) === field(right.description) && field(left.details) === field(right.details);
};
const calendarDayDistance = (left: string, right: string) => {
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00Z`), rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? Math.abs(leftTime - rightTime) / 86400000 : Infinity;
};
const importDescriptionUpdate = (
  existing: { description: string; details?: string | null },
  incoming: { description: string; details?: string | null },
) => {
  const incomingDescription = String(incoming.description || "").trim();
  const incomingDetails = typeof incoming.details === "string" ? incoming.details.trim() || null : null;
  const existingScore = normalizedImportDescription(existing.description).length + normalizedImportDescription(existing.details || "").length;
  const incomingScore = normalizedImportDescription(incomingDescription).length + normalizedImportDescription(incomingDetails || "").length;
  const useIncoming = incomingDetails ? incomingScore > existingScore || !existing.details : incomingScore > existingScore;
  return {
    description: useIncoming ? incomingDescription : existing.description,
    details: useIncoming ? incomingDetails : existing.details || null,
  };
};
const fixedMatchScore = (name: string, keywords: string[], expected: number, description: string, amount: number) => {
  const difference = Math.abs(expected - Math.abs(amount));
  const exactAmount = difference < 0.005;
  const compatibleText = hasFixedDescriptionMatch(name, description, keywords);
  if (exactAmount && compatibleText) return 0;
  if (compatibleText && difference <= 5) return 100 + difference;
  if (exactAmount) return 200;
  return Infinity;
};
const fixedExpenseMatches = (name: string, keywords: string[], expected: number, description: string, amount: number) => {
  const difference = Math.abs(expected - Math.abs(amount));
  return difference < 0.005 || (difference <= 5 && hasFixedDescriptionMatch(name, description, keywords));
};
const fixedMatchWords = (value: string) => value.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2);
const hasFixedDescriptionMatch = (name: string, description: string, keywords: string[] = []) => {
  const descriptionWords = fixedMatchWords(description), compactDescription = descriptionWords.join("");
  return [name, ...keywords].some((candidate) => {
    const candidateWords = fixedMatchWords(candidate), compactCandidate = candidateWords.join("");
    return compactCandidate.length > 0 && (compactDescription.includes(compactCandidate) || compactCandidate.includes(compactDescription) ||
      candidateWords.some((word) => descriptionWords.some((descriptionWord) => descriptionWord.includes(word) || word.includes(descriptionWord))));
  });
};

const associationLocationWords = [
  "roma", "milano", "napoli", "torino", "firenze", "bologna", "genova", "palermo", "venezia", "verona", "padova", "trieste",
  "via", "viale", "piazza", "corso", "largo", "strada", "localita", "provincia",
];
const sensibleAssociationKeywords = (description: string, details?: string | null) => Array.from(new Set(
  `${description} ${details || ""}`.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:it\d{2}[a-z0-9]{20,}|[a-z0-9]{16,})\b/g, " ")
    .replace(/[^a-z0-9à-ÿ ]/g, " ").split(/\s+/)
    .filter((word) => word.length >= 3 && word.length <= 24 && !automaticKeywordStopWords.has(word) && !/\d{4,}/.test(word)),
)).slice(0, 8);

async function learnAssociationKeywords(ownerEmail: string, transaction: { description: string; details?: string | null }, categoryName?: string | null, fixedExpenseId?: number | null) {
  const learned = sensibleAssociationKeywords(transaction.description, transaction.details);
  if (!learned.length) return;
  const db = getDb();
  if (categoryName && categoryName !== "Altro") {
    const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.ownerEmail, ownerEmail), eq(categories.name, categoryName))).limit(1);
    if (category) {
      for (const keyword of learned) {
        const [blacklisted, existing] = await Promise.all([
          db.select().from(keywordBlacklists).where(and(eq(keywordBlacklists.ownerEmail, ownerEmail), eq(keywordBlacklists.scope, "category"))),
          db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, ownerEmail)),
        ]);
        if (blacklisted.some((row) => normalizeKeyword(row.keyword) === keyword) || existing.some((row) => row.categoryId === category.id && normalizeKeyword(row.keyword) === keyword)) continue;
        const conflicts = existing.filter((row) => row.categoryId !== category.id && normalizeKeyword(row.keyword) === keyword);
        if (conflicts.some((row) => row.source !== "automatic")) continue;
        if (conflicts.length) {
          await db.batch([
            db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, ownerEmail), inArray(categoryKeywords.id, conflicts.filter((row) => row.source === "automatic").map((row) => row.id)))),
            db.insert(keywordBlacklists).values({ ownerEmail, scope: "category", keyword, source: "automatic", createdAt: now() }).onConflictDoNothing(),
          ]);
          continue;
        }
        await db.insert(categoryKeywords).values({ ownerEmail, categoryId: category.id, keyword, source: "automatic" }).onConflictDoNothing();
      }
    }
  }
  if (fixedExpenseId && Number.isInteger(fixedExpenseId)) {
    const [expense] = await db.select().from(fixedExpenses).where(and(eq(fixedExpenses.ownerEmail, ownerEmail), eq(fixedExpenses.id, fixedExpenseId))).limit(1);
    if (expense) {
      const allExpenses = await db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, ownerEmail));
      const knownSources = await db.select().from(fixedExpenseKeywordSources).where(eq(fixedExpenseKeywordSources.ownerEmail, ownerEmail));
      const missingSources = allExpenses.flatMap((item) => parseFixedExpenseKeywords(item.keywords)
        .filter((keyword) => !knownSources.some((source) => source.fixedExpenseId === item.id && source.keyword === keyword))
        .map((keyword) => ({ ownerEmail, fixedExpenseId: item.id, keyword, source: "manual" })));
      if (missingSources.length) await db.insert(fixedExpenseKeywordSources).values(missingSources).onConflictDoNothing();
      let targetKeywords = parseFixedExpenseKeywords(expense.keywords);
      for (const keyword of learned) {
        const [blacklisted, sources] = await Promise.all([
          db.select().from(keywordBlacklists).where(and(eq(keywordBlacklists.ownerEmail, ownerEmail), eq(keywordBlacklists.scope, "fixed_expense"))),
          db.select().from(fixedExpenseKeywordSources).where(eq(fixedExpenseKeywordSources.ownerEmail, ownerEmail)),
        ]);
        if (blacklisted.some((row) => normalizeKeyword(row.keyword) === keyword) || targetKeywords.includes(keyword)) continue;
        const conflicts = sources.filter((source) => source.fixedExpenseId !== expense.id && normalizeKeyword(source.keyword) === keyword);
        if (conflicts.some((source) => source.source !== "automatic")) continue;
        if (conflicts.length) {
          const conflictingExpenses = allExpenses.filter((item) => conflicts.some((source) => source.fixedExpenseId === item.id));
          await db.batch([
            db.delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, ownerEmail), inArray(fixedExpenseKeywordSources.id, conflicts.filter((source) => source.source === "automatic").map((source) => source.id)))),
            ...conflictingExpenses.map((item) => db.update(fixedExpenses).set({ keywords: JSON.stringify(parseFixedExpenseKeywords(item.keywords).filter((value) => value !== keyword)) }).where(eq(fixedExpenses.id, item.id))),
            db.insert(keywordBlacklists).values({ ownerEmail, scope: "fixed_expense", keyword, source: "automatic", createdAt: now() }).onConflictDoNothing(),
          ]);
          continue;
        }
        targetKeywords = [...targetKeywords, keyword];
        await db.batch([
          db.update(fixedExpenses).set({ keywords: JSON.stringify(targetKeywords) }).where(eq(fixedExpenses.id, expense.id)),
          db.insert(fixedExpenseKeywordSources).values({ ownerEmail, fixedExpenseId: expense.id, keyword, source: "automatic" }).onConflictDoNothing(),
        ]);
      }
    }
  }
}

async function validateManualKeywords(ownerEmail: string, scope: KeywordScope, entityId: number | null, values: unknown): Promise<{ keywords: string[]; error?: string }> {
  const keywords = cleanKeywords(values);
  const db = getDb();
  const blacklist = await db.select().from(keywordBlacklists).where(and(eq(keywordBlacklists.ownerEmail, ownerEmail), eq(keywordBlacklists.scope, scope)));
  const blocked = keywords.find((keyword) => blacklist.some((row) => normalizeKeyword(row.keyword) === keyword));
  if (blocked) return { error: `La parola chiave "${blocked}" è presente nella blacklist ${scope === "category" ? "delle categorie" : "delle spese fisse"}. Rimuovila dalla blacklist prima di utilizzarla.`, keywords };
  if (scope === "category") {
    const [rows, categoryRows] = await Promise.all([
      db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, ownerEmail)),
      db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.ownerEmail, ownerEmail)),
    ]);
    const conflict = rows.find((row) => row.categoryId !== entityId && keywords.includes(normalizeKeyword(row.keyword)));
    if (conflict) return { error: `La parola chiave "${normalizeKeyword(conflict.keyword)}" è già utilizzata dalla categoria "${categoryRows.find((item) => item.id === conflict.categoryId)?.name || "un'altra categoria"}".`, keywords };
  } else {
    const expenses = await db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, ownerEmail));
    const conflictExpense = expenses.find((expense) => expense.id !== entityId && parseFixedExpenseKeywords(expense.keywords).some((keyword) => keywords.includes(keyword)));
    if (conflictExpense) {
      const conflict = parseFixedExpenseKeywords(conflictExpense.keywords).find((keyword) => keywords.includes(keyword));
      return { error: `La parola chiave "${conflict}" è già utilizzata dalla spesa fissa "${conflictExpense.name}".`, keywords };
    }
  }
  return { keywords };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  const db = getDb();
  let categoryRows = await db
    .select()
    .from(categories)
    .where(eq(categories.ownerEmail, user.email));
  const categoriesMigrationFlagId = `${user.email}:default-categories-v2`;
  const categoriesMigrationFlag = await db.select({ id: appFlags.id }).from(appFlags)
    .where(eq(appFlags.id, categoriesMigrationFlagId)).limit(1);
  if (!categoriesMigrationFlag.length && categoryRows.length) {
    const replacements: Record<string, string> = {
      Casa: "Bollette",
      Trasporti: "Benzina",
      Salute: "Farmacia",
      Svago: "Abbonamenti",
      Ristoranti: "Mangiare fuori",
      Shopping: "Shopping online",
    };
    for (const [oldCategory, newCategory] of Object.entries(replacements)) {
      await db.update(transactions).set({ category: newCategory }).where(and(
        eq(transactions.ownerEmail, user.email),
        eq(transactions.category, oldCategory),
      ));
    }
    const allowedCategoryNames = defaultCategories.map(([name]) => name);
    await db.update(transactions).set({ category: "Altro" }).where(and(
      eq(transactions.ownerEmail, user.email),
      notInArray(transactions.category, allowedCategoryNames),
    ));
    await db.delete(categoryKeywords).where(eq(categoryKeywords.ownerEmail, user.email));
    await db.delete(categories).where(eq(categories.ownerEmail, user.email));
    categoryRows = await db.insert(categories).values(defaultCategories.map(([name, color]) => ({
      ownerEmail: user.email,
      name,
      color,
      createdAt: now(),
    }))).returning();
    await db.delete(appFlags).where(eq(appFlags.id, `${user.email}:category-keywords-v1`));
    await db.insert(appFlags).values({
      id: categoriesMigrationFlagId,
      ownerEmail: user.email,
      key: "default-categories-v2",
      value: "1",
    }).onConflictDoNothing();
  }
  if (!categoryRows.length) {
    categoryRows = await db
      .insert(categories)
      .values(
        defaultCategories.map(([name, color]) => ({
          ownerEmail: user.email,
          name,
          color,
          createdAt: now(),
        })),
      )
      .returning();
    await db.insert(appFlags).values({
      id: categoriesMigrationFlagId,
      ownerEmail: user.email,
      key: "default-categories-v2",
      value: "1",
    }).onConflictDoNothing();
  }
  if (!categoryRows.some((category) => category.name === "Rimborso")) {
    const [refundCategory] = await db.insert(categories).values({
      ownerEmail: user.email,
      name: "Rimborso",
      color: "#3279a8",
      createdAt: now(),
    }).returning();
    categoryRows = [...categoryRows, refundCategory];
  }
  if (!categoryRows.some((category) => category.name === "Ricarica")) {
    const [topUpCategory] = await db.insert(categories).values({
      ownerEmail: user.email,
      name: "Ricarica",
      color: "#b06c49",
      createdAt: now(),
    }).returning();
    categoryRows = [...categoryRows, topUpCategory];
  }
  const keywordFlagId = `${user.email}:category-keywords-v1`;
  const keywordFlag = await db.select({ id: appFlags.id }).from(appFlags).where(eq(appFlags.id, keywordFlagId)).limit(1);
  if (!keywordFlag.length) {
    const seedRows = categoryRows.flatMap((category) =>
      (defaultCategoryKeywords[category.name] || []).map((keyword) => ({
        ownerEmail: user.email,
        categoryId: category.id,
        keyword,
      })),
    );
    // D1/SQLite limits the number of bound variables in one statement.
    // Each keyword uses three variables, so insert in conservative batches.
    for (let index = 0; index < seedRows.length; index += 20) {
      await db.insert(categoryKeywords).values(seedRows.slice(index, index + 20)).onConflictDoNothing();
    }
    await db.insert(appFlags).values({ id: keywordFlagId, ownerEmail: user.email, key: "category-keywords-v1", value: "1" }).onConflictDoNothing();
  }
  const locationKeywordCleanupFlagId = `${user.email}:category-location-keywords-cleanup-v2`;
  const locationKeywordCleanupFlag = await db.select({ id: appFlags.id }).from(appFlags).where(eq(appFlags.id, locationKeywordCleanupFlagId)).limit(1);
  if (!locationKeywordCleanupFlag.length) {
    const foundLocationKeywords = Array.from(new Set((await db.select({ keyword: categoryKeywords.keyword }).from(categoryKeywords).where(and(
      eq(categoryKeywords.ownerEmail, user.email), inArray(categoryKeywords.keyword, associationLocationWords),
    ))).map((row) => row.keyword)));
    await db.batch([
      db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, user.email), inArray(categoryKeywords.keyword, associationLocationWords))),
      ...foundLocationKeywords.map((keyword) => db.insert(keywordBlacklists).values({ ownerEmail: user.email, scope: "category", keyword, source: "automatic", createdAt: now() }).onConflictDoNothing()),
      db.insert(appFlags).values({ id: locationKeywordCleanupFlagId, ownerEmail: user.email, key: "category-location-keywords-cleanup-v2", value: "1" }).onConflictDoNothing(),
    ]);
  }
  let keywordRows = await db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, user.email));
  const duplicateCategoryKeywords = Array.from(new Set(keywordRows.filter((row) => keywordRows.some((other) => normalizeKeyword(other.keyword) === normalizeKeyword(row.keyword) && other.categoryId !== row.categoryId)).map((row) => normalizeKeyword(row.keyword))));
  for (const keyword of duplicateCategoryKeywords) {
    const duplicateIds = keywordRows.filter((row) => normalizeKeyword(row.keyword) === keyword).map((row) => row.id);
    await db.batch([
      db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, user.email), inArray(categoryKeywords.id, duplicateIds))),
      db.insert(keywordBlacklists).values({ ownerEmail: user.email, scope: "category", keyword, source: "automatic", createdAt: now() }).onConflictDoNothing(),
    ]);
  }
  if (duplicateCategoryKeywords.length) keywordRows = keywordRows.filter((row) => !duplicateCategoryKeywords.includes(normalizeKeyword(row.keyword)));
  const [a, t, b, settings, goals, recurring, recurringPayments, recurringSkips] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerEmail, user.email)),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.ownerEmail, user.email))
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db.select().from(budgets).where(eq(budgets.ownerEmail, user.email)),
    db.select().from(userSettings).where(eq(userSettings.ownerEmail, user.email)).limit(1),
    db.select().from(accountGoals).where(eq(accountGoals.ownerEmail, user.email)),
    db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, user.email)),
    db.select().from(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, user.email)),
    db.select().from(fixedExpenseSkips).where(eq(fixedExpenseSkips.ownerEmail, user.email)),
  ]);
  const duplicateFixedKeywords = Array.from(new Set(recurring.flatMap((expense) => parseFixedExpenseKeywords(expense.keywords)
    .filter((keyword) => recurring.some((other) => other.id !== expense.id && parseFixedExpenseKeywords(other.keywords).includes(keyword))))));
  const blockedFixedKeywords = Array.from(new Set(recurring.flatMap((expense) => parseFixedExpenseKeywords(expense.keywords).filter((keyword) => associationLocationWords.includes(keyword)))));
  for (const keyword of Array.from(new Set([...duplicateFixedKeywords, ...blockedFixedKeywords]))) {
    const affected = recurring.filter((expense) => parseFixedExpenseKeywords(expense.keywords).includes(keyword));
    await db.batch([
      db.delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, user.email), eq(fixedExpenseKeywordSources.keyword, keyword))),
      ...affected.map((expense) => db.update(fixedExpenses).set({ keywords: JSON.stringify(parseFixedExpenseKeywords(expense.keywords).filter((value) => value !== keyword)) }).where(eq(fixedExpenses.id, expense.id))),
      db.insert(keywordBlacklists).values({ ownerEmail: user.email, scope: "fixed_expense", keyword, source: "automatic", createdAt: now() }).onConflictDoNothing(),
    ]);
  }
  const blacklistRows = await db.select().from(keywordBlacklists).where(eq(keywordBlacklists.ownerEmail, user.email));
  const configuredHomeAccountId = settings[0]?.homeAccountId ?? null;
  const normalizedRecurringPayments = recurringPayments.map((payment) => {
    const transaction = t.find((item) => item.id === payment.transactionId);
    const account = transaction ? a.find((item) => item.id === transaction.accountId) : null;
    return transaction && account ? { ...payment, month: accountCycleMonth(transaction.date, account.type) } : payment;
  });
  const normalizedRecurringSkips = recurringSkips.map((skip) => {
    const expense = recurring.find((item) => item.id === skip.fixedExpenseId);
    const account = expense ? a.find((item) => item.id === expense.accountId) : null;
    return account ? { ...skip, month: accountCycleMonth(skip.createdAt.slice(0, 10), account.type) } : skip;
  });
  for (const payment of normalizedRecurringPayments) {
    const stored = recurringPayments.find((item) => item.id === payment.id);
    if (stored && stored.month !== payment.month) try { await db.update(fixedExpensePayments).set({ month: payment.month }).where(eq(fixedExpensePayments.id, payment.id)); } catch { /* A normalized record for this cycle already exists. */ }
  }
  for (const skip of normalizedRecurringSkips) {
    const stored = recurringSkips.find((item) => item.id === skip.id);
    if (stored && stored.month !== skip.month) try { await db.update(fixedExpenseSkips).set({ month: skip.month }).where(eq(fixedExpenseSkips.id, skip.id)); } catch { /* A normalized record for this cycle already exists. */ }
  }
  const homeAccountId = configuredHomeAccountId !== null && a.some((account) => account.id === configuredHomeAccountId)
    ? configuredHomeAccountId
    : null;
  return Response.json({
    accounts: a.map((account) => ({
      ...account,
      savingsGoal: goals.find((goal) => goal.accountId === account.id)?.amount ?? null,
    })),
    transactions: t.map((transaction) => ({
      ...transaction,
      fixedExpenseId: normalizedRecurringPayments.find((payment) => payment.transactionId === transaction.id)?.fixedExpenseId ?? null,
    })),
    budgets: b,
    categories: categoryRows.map((category) => ({
      ...category,
      keywords: keywordRows.filter((row) => row.categoryId === category.id).map((row) => row.keyword),
    })),
    fixedExpenses: recurring.map((expense) => ({
      ...expense,
      keywords: parseFixedExpenseKeywords(expense.keywords).filter((keyword) => !duplicateFixedKeywords.includes(keyword) && !blockedFixedKeywords.includes(keyword)),
      payments: normalizedRecurringPayments.filter((payment) => payment.fixedExpenseId === expense.id),
      skippedMonths: normalizedRecurringSkips.filter((skip) => skip.fixedExpenseId === expense.id).map((skip) => skip.month),
    })),
    homeAccountId,
    keywordBlacklists: {
      categories: blacklistRows.filter((row) => row.scope === "category").map((row) => row.keyword),
      fixedExpenses: blacklistRows.filter((row) => row.scope === "fixed_expense").map((row) => row.keyword),
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  const body = (await request.json()) as Record<string, any>;
  const db = getDb();
  if (body.action === "keyword-blacklist-add") {
    const scope: KeywordScope = body.scope === "fixed_expense" ? "fixed_expense" : "category";
    const keyword = normalizeKeyword(body.keyword);
    if (!keyword) return Response.json({ error: "Inserisci una parola chiave valida" }, { status: 400 });
    if (scope === "category") {
      await db.batch([
        db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, user.email), eq(categoryKeywords.keyword, keyword))),
        db.insert(keywordBlacklists).values({ ownerEmail: user.email, scope, keyword, source: "manual", createdAt: now() }).onConflictDoNothing(),
      ]);
    } else {
      const expenses = await db.select().from(fixedExpenses).where(eq(fixedExpenses.ownerEmail, user.email));
      await db.batch([
        db.delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, user.email), eq(fixedExpenseKeywordSources.keyword, keyword))),
        ...expenses.filter((expense) => parseFixedExpenseKeywords(expense.keywords).includes(keyword)).map((expense) => db.update(fixedExpenses).set({ keywords: JSON.stringify(parseFixedExpenseKeywords(expense.keywords).filter((value) => value !== keyword)) }).where(eq(fixedExpenses.id, expense.id))),
        db.insert(keywordBlacklists).values({ ownerEmail: user.email, scope, keyword, source: "manual", createdAt: now() }).onConflictDoNothing(),
      ]);
    }
    return Response.json({ ok: true, keyword });
  }
  if (body.action === "keyword-blacklist-remove") {
    const scope: KeywordScope = body.scope === "fixed_expense" ? "fixed_expense" : "category";
    const keyword = normalizeKeyword(body.keyword);
    await db.delete(keywordBlacklists).where(and(eq(keywordBlacklists.ownerEmail, user.email), eq(keywordBlacklists.scope, scope), eq(keywordBlacklists.keyword, keyword)));
    return Response.json({ ok: true });
  }
  if (body.action === "home-account") {
    const homeAccountId = body.accountId === "all" ? null : Number(body.accountId);
    if (homeAccountId !== null) {
      if (!Number.isInteger(homeAccountId) || homeAccountId < 1)
        return Response.json({ error: "Conto non valido" }, { status: 400 });
      const own = await db.select({ id: accounts.id }).from(accounts).where(
        and(eq(accounts.id, homeAccountId), eq(accounts.ownerEmail, user.email)),
      ).limit(1);
      if (!own.length)
        return Response.json({ error: "Conto non valido" }, { status: 400 });
    }
    await db.insert(userSettings).values({ ownerEmail: user.email, homeAccountId })
      .onConflictDoUpdate({ target: userSettings.ownerEmail, set: { homeAccountId } });
    return Response.json({ ok: true, homeAccountId });
  }
  if (body.action === "savings-goal") {
    const accountId = Number(body.accountId);
    const amount = Number(body.amount);
    if (!Number.isInteger(accountId) || accountId < 1 || !Number.isFinite(amount) || amount <= 0)
      return Response.json({ error: "Obiettivo non valido" }, { status: 400 });
    const own = await db.select({ id: accounts.id }).from(accounts).where(
      and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email), eq(accounts.type, "risparmi")),
    ).limit(1);
    if (!own.length)
      return Response.json({ error: "Conto risparmio non valido" }, { status: 400 });
    await db.insert(accountGoals).values({ accountId, ownerEmail: user.email, amount })
      .onConflictDoUpdate({ target: accountGoals.accountId, set: { amount, ownerEmail: user.email } });
    return Response.json({ ok: true });
  }
  if (body.action === "fixed-expense") {
    const accountId = Number(body.accountId), amount = Math.abs(Number(body.amount));
    const [account] = await db.select().from(accounts).where(and(
      eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email),
    )).limit(1);
    if (!account || !["personale", "spese_mese"].includes(account.type) || !String(body.name || "").trim() || !Number.isFinite(amount) || amount <= 0)
      return Response.json({ error: "Spesa fissa non valida" }, { status: 400 });
    const validation = await validateManualKeywords(user.email, "fixed_expense", null, body.keywords);
    if (validation.error) return Response.json({ error: validation.error }, { status: 409 });
    const [row] = await db.insert(fixedExpenses).values({
      ownerEmail: user.email,
      accountId,
      name: String(body.name).trim(),
      category: String(body.category || "").trim() || null,
      keywords: JSON.stringify(validation.keywords),
      amount,
      createdAt: now(),
    }).returning();
    if (validation.keywords.length) await db.insert(fixedExpenseKeywordSources).values(validation.keywords.map((keyword) => ({ ownerEmail: user.email, fixedExpenseId: row.id, keyword, source: "manual" }))).onConflictDoNothing();
    const month = accountCycleMonth(new Date().toISOString().slice(0, 10), account.type);
    const period = accountPeriodBounds(month, account.type);
    const alreadyLinked = new Set((await db.select({ transactionId: fixedExpensePayments.transactionId }).from(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, user.email))).map((payment) => payment.transactionId));
    const possibleTransactions = (await db.select().from(transactions).where(and(
      eq(transactions.ownerEmail, user.email), eq(transactions.accountId, accountId), gte(transactions.date, period.start), lte(transactions.date, period.end),
    ))).filter((transaction) => transaction.amount < 0 && !alreadyLinked.has(transaction.id) && fixedExpenseMatches(row.name, parseFixedExpenseKeywords(row.keywords), amount, [transaction.description, transaction.details].filter(Boolean).join(" "), transaction.amount))
      .sort((left, right) => fixedMatchScore(row.name, parseFixedExpenseKeywords(row.keywords), amount, [left.description, left.details].filter(Boolean).join(" "), left.amount) - fixedMatchScore(row.name, parseFixedExpenseKeywords(row.keywords), amount, [right.description, right.details].filter(Boolean).join(" "), right.amount));
    return Response.json({ row: { ...row, keywords: parseFixedExpenseKeywords(row.keywords), payments: [] }, possibleTransactions });
  }
  if (body.action === "fixed-expense-update") {
    const id = Number(body.id), amount = Math.abs(Number(body.amount)), name = String(body.name || "").trim();
    if (!name || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Spesa fissa non valida" }, { status: 400 });
    const validation = await validateManualKeywords(user.email, "fixed_expense", id, body.keywords);
    if (validation.error) return Response.json({ error: validation.error }, { status: 409 });
    const category = String(body.category || "").trim() || null, keywords = JSON.stringify(validation.keywords);
    await db.update(fixedExpenses).set({ name, amount, category, keywords }).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.ownerEmail, user.email)));
    await db.delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, user.email), eq(fixedExpenseKeywordSources.fixedExpenseId, id)));
    if (validation.keywords.length) await db.insert(fixedExpenseKeywordSources).values(validation.keywords.map((keyword) => ({ ownerEmail: user.email, fixedExpenseId: id, keyword, source: "manual" }))).onConflictDoNothing();
    return Response.json({ ok: true });
  }
  if (body.action === "fixed-expense-active") {
    const id = Number(body.id), active = body.active === true;
    const updated = await db.update(fixedExpenses).set({ active }).where(and(
      eq(fixedExpenses.id, id), eq(fixedExpenses.ownerEmail, user.email),
    )).returning({ id: fixedExpenses.id });
    if (!updated.length) return Response.json({ error: "Spesa fissa non valida" }, { status: 400 });
    return Response.json({ ok: true, active });
  }
  if (body.action === "fixed-expense-skip") {
    const fixedExpenseId = Number(body.id), month = String(body.month || new Date().toISOString().slice(0, 7));
    const where = and(eq(fixedExpenseSkips.ownerEmail, user.email), eq(fixedExpenseSkips.fixedExpenseId, fixedExpenseId), eq(fixedExpenseSkips.month, month));
    const existing = await db.select({ id: fixedExpenseSkips.id }).from(fixedExpenseSkips).where(where).limit(1);
    if (existing.length) await db.delete(fixedExpenseSkips).where(where);
    else await db.insert(fixedExpenseSkips).values({ ownerEmail: user.email, fixedExpenseId, month, createdAt: now() });
    return Response.json({ ok: true, skipped: !existing.length });
  }
  if (body.action === "fixed-expense-search") {
    const fixedExpenseId = Number(body.id), month = String(body.month || new Date().toISOString().slice(0, 7));
    const [expense] = await db.select().from(fixedExpenses).where(and(
      eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email),
    )).limit(1);
    if (!expense || expense.active === false) return Response.json({ error: "Spesa fissa non valida o disabilitata" }, { status: 400 });
    const [expenseAccount] = await db.select().from(accounts).where(and(eq(accounts.id, expense.accountId), eq(accounts.ownerEmail, user.email))).limit(1);
    if (!expenseAccount) return Response.json({ error: "Conto non valido" }, { status: 400 });
    const period = accountPeriodBounds(month, expenseAccount.type);
    const alreadyPaid = await db.select({ id: fixedExpensePayments.id }).from(fixedExpensePayments).where(and(
      eq(fixedExpensePayments.ownerEmail, user.email), eq(fixedExpensePayments.fixedExpenseId, fixedExpenseId), eq(fixedExpensePayments.month, month),
    )).limit(1);
    if (alreadyPaid.length) return Response.json({ error: "Questa spesa risulta già pagata" }, { status: 400 });
    const alreadyLinked = new Set((await db.select({ transactionId: fixedExpensePayments.transactionId }).from(fixedExpensePayments).where(
      eq(fixedExpensePayments.ownerEmail, user.email),
    )).map((payment) => payment.transactionId));
    const matches = (await db.select().from(transactions).where(and(
      eq(transactions.ownerEmail, user.email), eq(transactions.accountId, expense.accountId), gte(transactions.date, period.start), lte(transactions.date, period.end),
    ))).filter((transaction) => transaction.amount < 0 && !alreadyLinked.has(transaction.id) && fixedExpenseMatches(expense.name, parseFixedExpenseKeywords(expense.keywords), expense.amount, [transaction.description, transaction.details].filter(Boolean).join(" "), transaction.amount))
      .sort((left, right) => fixedMatchScore(expense.name, parseFixedExpenseKeywords(expense.keywords), expense.amount, [left.description, left.details].filter(Boolean).join(" "), left.amount) - fixedMatchScore(expense.name, parseFixedExpenseKeywords(expense.keywords), expense.amount, [right.description, right.details].filter(Boolean).join(" "), right.amount))
      .slice(0, 10);
    return Response.json({ matches });
  }
  if (body.action === "fixed-expense-paid") {
    const fixedExpenseId = Number(body.fixedExpenseId), transactionId = Number(body.transactionId);
    const [expense] = await db.select().from(fixedExpenses).where(and(eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email))).limit(1);
    const [transaction] = await db.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.ownerEmail, user.email))).limit(1);
    if (!expense || !transaction || expense.accountId !== transaction.accountId)
      return Response.json({ error: "Corrispondenza non valida" }, { status: 400 });
    const [paymentAccount] = await db.select().from(accounts).where(and(eq(accounts.id, transaction.accountId), eq(accounts.ownerEmail, user.email))).limit(1);
    if (!paymentAccount) return Response.json({ error: "Conto non valido" }, { status: 400 });
    await db.insert(fixedExpensePayments).values({ ownerEmail: user.email, fixedExpenseId, transactionId, month: accountCycleMonth(transaction.date, paymentAccount.type), createdAt: now() }).onConflictDoNothing();
    await learnAssociationKeywords(user.email, transaction, null, fixedExpenseId);
    return Response.json({ ok: true });
  }
  if (body.action === "fixed-expense-unpaid") {
    const fixedExpenseId = Number(body.id), month = String(body.month || new Date().toISOString().slice(0, 7));
    await db.delete(fixedExpensePayments).where(and(
      eq(fixedExpensePayments.ownerEmail, user.email), eq(fixedExpensePayments.fixedExpenseId, fixedExpenseId), eq(fixedExpensePayments.month, month),
    ));
    return Response.json({ ok: true });
  }
  if (body.action === "account") {
    const [row] = await db
      .insert(accounts)
      .values({
        ownerEmail: user.email,
        name: String(body.name).trim(),
        color: body.color || "#173f35",
        type: body.type || "personale",
        createdAt: now(),
      })
      .returning();
    return Response.json({ row });
  }
  if (body.action === "account-update") {
    const allowed = ["personale", "risparmi", "spese_mese"];
    if (!allowed.includes(body.type))
      return Response.json({ error: "Tipologia non valida" }, { status: 400 });
    await db
      .update(accounts)
      .set({ type: body.type })
      .where(
        and(
          eq(accounts.id, Number(body.id)),
          eq(accounts.ownerEmail, user.email),
        ),
      );
    return Response.json({ ok: true });
  }
  if (body.action === "budget") {
    await db
      .insert(budgets)
      .values({
        ownerEmail: user.email,
        month: body.month,
        amount: Number(body.amount),
      })
      .onConflictDoUpdate({
        target: [budgets.ownerEmail, budgets.month],
        set: { amount: Number(body.amount) },
      });
    return Response.json({ ok: true });
  }
  if (body.action === "category") {
    const name = String(body.name || "").trim();
    if (!name)
      return Response.json(
        { error: "Il nome è obbligatorio" },
        { status: 400 },
      );
    const validation = await validateManualKeywords(user.email, "category", null, body.keywords);
    if (validation.error) return Response.json({ error: validation.error }, { status: 409 });
    try {
      const [row] = await db
        .insert(categories)
        .values({
          ownerEmail: user.email,
          name,
          color: body.color || "#4e8d7c",
          createdAt: now(),
        })
        .returning();
      const keywords = validation.keywords;
      if (keywords.length) await db.insert(categoryKeywords).values(keywords.map((keyword) => ({ ownerEmail: user.email, categoryId: row.id, keyword, source: "manual" })));
      return Response.json({ row: { ...row, keywords } });
    } catch {
      return Response.json(
        { error: "Esiste già una categoria con questo nome" },
        { status: 409 },
      );
    }
  }
  if (body.action === "category-update") {
    const current = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, Number(body.id)),
          eq(categories.ownerEmail, user.email),
        ),
      )
      .limit(1);
    if (!current.length)
      return Response.json({ error: "Categoria non trovata" }, { status: 404 });
    const name = String(body.name || "").trim();
    const validation = await validateManualKeywords(user.email, "category", Number(body.id), body.keywords);
    if (validation.error) return Response.json({ error: validation.error }, { status: 409 });
    await db
      .update(transactions)
      .set({ category: name })
      .where(
        and(
          eq(transactions.ownerEmail, user.email),
          eq(transactions.category, current[0].name),
        ),
      );
    await db
      .update(categories)
      .set({ name, color: body.color || current[0].color })
      .where(
        and(
          eq(categories.id, Number(body.id)),
          eq(categories.ownerEmail, user.email),
        ),
      );
    const keywords = validation.keywords;
    await db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, user.email), eq(categoryKeywords.categoryId, Number(body.id))));
    if (keywords.length) await db.insert(categoryKeywords).values(keywords.map((keyword) => ({ ownerEmail: user.email, categoryId: Number(body.id), keyword, source: "manual" })));
    return Response.json({ ok: true });
  }
  if (body.action === "transaction") {
    const accountId = Number(body.accountId);
    const own = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
      )
      .limit(1);
    if (!own.length)
      return Response.json({ error: "Conto non valido" }, { status: 400 });
    const amount = Number(body.amount);
    const description = String(body.description || "").trim();
    const details = typeof body.details === "string" && body.details.trim() ? body.details.trim().slice(0, 2000) : null;
    if (body.force !== true) {
      const candidates = await db.select().from(transactions).where(and(
        eq(transactions.ownerEmail, user.email), eq(transactions.accountId, accountId), eq(transactions.date, String(body.date)), eq(transactions.amount, amount),
      ));
      const duplicate = candidates.find((candidate) => transactionSimilarity(candidate, { description, details }) >= 0.6);
      if (duplicate) return Response.json({ duplicate: true, candidate: { id: duplicate.id, description: duplicate.description, details: duplicate.details } });
    }
    const fp = fingerprint(accountId, body.date, body.description, amount);
    try {
      const [row] = await db
        .insert(transactions)
        .values({
          ownerEmail: user.email,
          accountId,
          date: body.date,
          description,
          details,
          amount,
          category: body.category || "Altro",
          source: body.source || "manuale",
          fingerprint: fp,
          createdAt: now(),
        })
        .returning();
      const fixedExpenseId = Number(body.fixedExpenseId);
      if (Number.isInteger(fixedExpenseId) && fixedExpenseId > 0) {
        const [expense] = await db.select().from(fixedExpenses).where(and(
          eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email), eq(fixedExpenses.accountId, accountId),
        )).limit(1);
        if (expense) await db.insert(fixedExpensePayments).values({
          ownerEmail: user.email, fixedExpenseId, transactionId: row.id, month: accountCycleMonth(row.date, own[0].type), createdAt: now(),
        }).onConflictDoNothing();
      }
      await learnAssociationKeywords(user.email, row, body.category || null, Number.isInteger(fixedExpenseId) && fixedExpenseId > 0 ? fixedExpenseId : null);
      return Response.json({ row, duplicate: false });
    } catch {
      return Response.json({ error: "Impossibile salvare il movimento" }, { status: 500 });
    }
  }
  if (body.action === "transaction-update") {
    const id = Number(body.id),
      accountId = Number(body.accountId),
      amount = Number(body.amount);
    const [existing] = await db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, id), eq(transactions.ownerEmail, user.email)),
      )
      .limit(1);
    const [ownAccount] = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
      )
      .limit(1);
    if (!existing || !ownAccount)
      return Response.json(
        { error: "Movimento o conto non valido" },
        { status: 400 },
      );
    const description = String(body.description || "").trim(),
      details = typeof body.details === "string" && body.details.trim() ? body.details.trim().slice(0, 2000) : null,
      date = String(body.date || "");
    if (!description || !date || !Number.isFinite(amount))
      return Response.json(
        { error: "Compila correttamente tutti i campi" },
        { status: 400 },
      );
    try {
      await db
        .update(transactions)
        .set({
          accountId,
          date,
          description,
          details,
          amount,
          category: body.category || "Altro",
          fingerprint: fingerprint(accountId, date, description, amount),
        })
        .where(
          and(eq(transactions.id, id), eq(transactions.ownerEmail, user.email)),
        );
      await db.delete(fixedExpensePayments).where(and(
        eq(fixedExpensePayments.ownerEmail, user.email),
        eq(fixedExpensePayments.transactionId, id),
      ));
      const fixedExpenseId = Number(body.fixedExpenseId);
      if (Number.isInteger(fixedExpenseId) && fixedExpenseId > 0 && amount < 0) {
        const [expense] = await db.select().from(fixedExpenses).where(and(
          eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email), eq(fixedExpenses.accountId, accountId),
        )).limit(1);
        if (expense) await db.insert(fixedExpensePayments).values({
          ownerEmail: user.email, fixedExpenseId, transactionId: id, month: accountCycleMonth(date, ownAccount.type), createdAt: now(),
        }).onConflictDoNothing();
      }
      if (amount < 0 && (body.category || "Altro") !== existing.category) {
        const candidates = await db.select().from(transactions).where(and(eq(transactions.ownerEmail, user.email), lt(transactions.amount, 0)));
        const similarIds = candidates.filter((candidate) => sameTransactionDescription(candidate, { description, details })).map((candidate) => candidate.id);
        if (similarIds.length) await db.update(transactions).set({ category: body.category || "Altro" }).where(and(
          eq(transactions.ownerEmail, user.email), inArray(transactions.id, similarIds),
        ));
      }
      await learnAssociationKeywords(user.email, { description, details }, (body.category || "Altro") !== existing.category ? body.category || "Altro" : null, Number.isInteger(fixedExpenseId) && fixedExpenseId > 0 ? fixedExpenseId : null);
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "Impossibile aggiornare il movimento" },
        { status: 500 },
      );
    }
  }
  if (body.action === "transaction-category-update") {
    const id = Number(body.id), category = String(body.category || "").trim();
    const [existing] = await db.select().from(transactions).where(and(
      eq(transactions.id, id), eq(transactions.ownerEmail, user.email),
    )).limit(1);
    const [ownCategory] = await db.select({ id: categories.id }).from(categories).where(and(
      eq(categories.ownerEmail, user.email), eq(categories.name, category),
    )).limit(1);
    if (!existing || !ownCategory) return Response.json({ error: "Movimento o categoria non validi" }, { status: 400 });
    let where = and(eq(transactions.ownerEmail, user.email), eq(transactions.id, id));
    if (existing.amount < 0) {
      const candidates = await db.select().from(transactions).where(and(eq(transactions.ownerEmail, user.email), lt(transactions.amount, 0)));
      const similarIds = candidates.filter((candidate) => sameTransactionDescription(candidate, existing)).map((candidate) => candidate.id);
      if (similarIds.length) where = and(eq(transactions.ownerEmail, user.email), inArray(transactions.id, similarIds));
    }
    const updated = await db.update(transactions).set({ category }).where(where).returning({ id: transactions.id });
    await learnAssociationKeywords(user.email, existing, category, null);
    return Response.json({ ok: true, updatedIds: updated.map((row) => row.id) });
  }
  if (body.action === "transaction-spread-update") {
    const id = Number(body.id), enabled = body.enabled === true;
    const [transaction] = await db.select({ id: transactions.id, amount: transactions.amount }).from(transactions).where(and(
      eq(transactions.id, id), eq(transactions.ownerEmail, user.email),
    )).limit(1);
    if (!transaction || transaction.amount >= 0)
      return Response.json({ error: "La ripartizione è disponibile solo per le uscite" }, { status: 400 });
    await db.update(transactions).set({ spreadAcrossWeeks: enabled }).where(and(
      eq(transactions.id, id), eq(transactions.ownerEmail, user.email),
    ));
    return Response.json({ ok: true });
  }
  if (body.action === "import") {
    const accountId = Number(body.accountId);
    const importSource = body.source === "enable_banking" ? "enable_banking" : "import";
    const own = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
      )
      .limit(1);
    if (!own.length)
      return Response.json({ error: "Conto non valido" }, { status: 400 });
    let inserted = 0,
      duplicates = 0,
      excluded = 0,
      reconciled = 0;
    const existingTransactions = await db.select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      details: transactions.details,
      amount: transactions.amount,
      source: transactions.source,
      externalTransactionId: transactions.externalTransactionId,
    }).from(transactions).where(and(
      eq(transactions.ownerEmail, user.email),
      eq(transactions.accountId, accountId),
    ));
    const currentExternalTransactionIds = new Set<string>();
    const currentImportedTransactions: Array<{ date: string; amount: number; description: string; details: string | null }> = [];
    for (const item of body.rows || []) {
      const amount = Number(item.amount);
      if (item.skip === true) {
        if (item.exclude === true) excluded++;
        else duplicates++;
        continue;
      }
      const externalTransactionId = importSource === "enable_banking" && typeof item.externalTransactionId === "string"
        ? item.externalTransactionId.trim().slice(0, 500) || null
        : null;
      if (item.categoryEdited === true && amount < 0) {
        const similarIds = existingTransactions
          .filter((transaction) => transaction.amount < 0 && sameTransactionDescription(transaction, { description: String(item.description), details: typeof item.details === "string" ? item.details : null }))
          .map((transaction) => transaction.id);
        if (similarIds.length) await db.update(transactions).set({ category: item.category || "Altro" }).where(and(
          eq(transactions.ownerEmail, user.email), inArray(transactions.id, similarIds),
        ));
      }
      const openBankingStatus = importSource === "enable_banking" && item.bankStatus === "BOOK" ? "BOOK" : null;
      if (item.confirmUpdate === true) {
        const updateTransactionId = Number(item.updateTransactionId);
        const [existingMatch] = Number.isInteger(updateTransactionId) && updateTransactionId > 0
          ? await db.select().from(transactions).where(and(
            eq(transactions.id, updateTransactionId),
            eq(transactions.ownerEmail, user.email),
            eq(transactions.accountId, accountId),
          )).limit(1)
          : [];
        const incomingDescription = { description: String(item.description), details: typeof item.details === "string" ? item.details : null };
        const isExternalUpdate = Boolean(externalTransactionId && existingMatch?.source === "enable_banking" && existingMatch.externalTransactionId === externalTransactionId);
        const dayDistance = existingMatch ? calendarDayDistance(existingMatch.date, String(item.date)) : Infinity;
        const isFileEnrichment = Boolean(importSource === "import" && existingMatch && Number(existingMatch.amount) === amount && dayDistance <= 2 && transactionSimilarity(existingMatch, incomingDescription) >= (dayDistance === 0 ? 0.6 : 0.8));
        if (!existingMatch || (!isExternalUpdate && !isFileEnrichment)) {
          return Response.json({ error: "Il movimento selezionato per l’aggiornamento non è più disponibile o non corrisponde." }, { status: 409 });
        }
        const updatedDescription = importDescriptionUpdate(existingMatch, incomingDescription);
        const updatedDate = isFileEnrichment ? existingMatch.date : String(item.date);
        const updatedAmount = isFileEnrichment ? Number(existingMatch.amount) : amount;
        const updatedFingerprint = fingerprint(accountId, updatedDate, updatedDescription.details || updatedDescription.description, updatedAmount);
        try {
          await db.batch([
            db.update(transactions).set({ date: updatedDate, amount: updatedAmount, description: updatedDescription.description, details: updatedDescription.details, fingerprint: updatedFingerprint }).where(and(eq(transactions.id, existingMatch.id), eq(transactions.ownerEmail, user.email))),
            db.update(fixedExpensePayments).set({ month: accountCycleMonth(updatedDate, own[0].type) }).where(and(eq(fixedExpensePayments.transactionId, existingMatch.id), eq(fixedExpensePayments.ownerEmail, user.email))),
          ]);
          reconciled++;
          continue;
        } catch {
          return Response.json({ error: "Impossibile aggiornare il movimento importato" }, { status: 500 });
        }
      }
      const incomingText = { description: String(item.description), details: typeof item.details === "string" ? item.details : null };
      const matchesExternalId = externalTransactionId && existingTransactions.some((transaction) =>
        transaction.source === "enable_banking" && transaction.externalTransactionId === externalTransactionId,
      );
      const matchesImportedFile = importSource === "import"
        ? existingTransactions.some((transaction) => {
          if (Number(transaction.amount) !== amount) return false;
          const days = calendarDayDistance(transaction.date, String(item.date));
          return days <= 2 && transactionSimilarity(transaction, incomingText) >= (days === 0 ? 0.6 : 0.8);
        }) || currentImportedTransactions.some((transaction) =>
          transaction.date === item.date && Number(transaction.amount) === amount && transactionSimilarity(transaction, incomingText) >= 0.6,
        )
        : importSource === "enable_banking" && (existingTransactions.some((transaction) =>
          Number(transaction.amount) === amount && sameTransactionDescription(transaction, incomingText)
        ) || currentImportedTransactions.some((transaction) =>
          Number(transaction.amount) === amount && sameTransactionDescription(transaction, incomingText)
        ));
      const matchesExisting = Boolean(matchesExternalId || matchesImportedFile);
      if ((matchesExisting || (externalTransactionId && currentExternalTransactionIds.has(externalTransactionId))) && item.force !== true) {
        duplicates++;
        continue;
      }
      const fp = fingerprint(accountId, item.date, item.details || item.description, amount);
      try {
        const [insertedRow] = await db
          .insert(transactions)
          .values({
            ownerEmail: user.email,
            accountId,
            date: item.date,
            description: String(item.description).trim(),
            details: typeof item.details === "string" && item.details.trim() ? item.details.trim().slice(0, 2000) : null,
            amount,
            category: item.category || "Altro",
            source: importSource,
            externalTransactionId: item.force === true ? null : externalTransactionId,
            openBankingStatus,
            fingerprint: fp,
            createdAt: now(),
          }).returning();
        const fixedExpenseId = Number(item.fixedExpenseId);
        if (Number.isInteger(fixedExpenseId) && fixedExpenseId > 0 && insertedRow) {
          const [expense] = await db.select().from(fixedExpenses).where(and(
            eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email), eq(fixedExpenses.accountId, accountId),
          )).limit(1);
          if (expense) await db.insert(fixedExpensePayments).values({
            ownerEmail: user.email, fixedExpenseId, transactionId: insertedRow.id, month: accountCycleMonth(insertedRow.date, own[0].type), createdAt: now(),
          }).onConflictDoNothing();
        }
        if (insertedRow && (item.categoryEdited === true || (Number.isInteger(fixedExpenseId) && fixedExpenseId > 0))) await learnAssociationKeywords(
          user.email,
          insertedRow,
          item.categoryEdited === true ? insertedRow.category : null,
          Number.isInteger(fixedExpenseId) && fixedExpenseId > 0 ? fixedExpenseId : null,
        );
        if (externalTransactionId) currentExternalTransactionIds.add(externalTransactionId);
        currentImportedTransactions.push({
          date: String(item.date), amount, description: String(item.description), details: typeof item.details === "string" ? item.details : null,
        });
        inserted++;
      } catch {
        if (externalTransactionId) duplicates++;
        else return Response.json({ error: "Impossibile importare il movimento" }, { status: 500 });
      }
    }
    return Response.json({ inserted, duplicates, excluded, reconciled });
  }
  if (body.action === "delete-all") {
    await db.delete(fixedExpenseSkips).where(eq(fixedExpenseSkips.ownerEmail, user.email));
    await db.delete(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, user.email));
    await db.delete(fixedExpenseKeywordSources).where(eq(fixedExpenseKeywordSources.ownerEmail, user.email));
    await db.delete(fixedExpenses).where(eq(fixedExpenses.ownerEmail, user.email));
    await db
      .delete(transactions)
      .where(eq(transactions.ownerEmail, user.email));
    await db.delete(budgets).where(eq(budgets.ownerEmail, user.email));
    await db.delete(accounts).where(eq(accounts.ownerEmail, user.email));
    await db.delete(accountGoals).where(eq(accountGoals.ownerEmail, user.email));
    await db.update(userSettings).set({ homeAccountId: null }).where(eq(userSettings.ownerEmail, user.email));
    return Response.json({ ok: true });
  }
  if (body.action === "delete-period") {
    const startDate = String(body.startDate || ""), endDate = String(body.endDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate)
      return Response.json({ error: "Periodo non valido" }, { status: 400 });
    const accountId = body.accountId === "all" ? null : Number(body.accountId);
    if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0))
      return Response.json({ error: "Conto non valido" }, { status: 400 });
    if (accountId !== null) {
      const own = await db
        .select()
        .from(accounts)
        .where(
          and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
        )
        .limit(1);
      if (!own.length)
        return Response.json({ error: "Conto non valido" }, { status: 400 });
    }
    const transactionFilter = accountId === null
      ? and(eq(transactions.ownerEmail, user.email), gte(transactions.date, startDate), lte(transactions.date, endDate))
      : and(eq(transactions.ownerEmail, user.email), eq(transactions.accountId, accountId), gte(transactions.date, startDate), lte(transactions.date, endDate));
    const rows = await db.select({ id: transactions.id }).from(transactions).where(transactionFilter);
    if (rows.length) {
      const transactionIds = rows.map((row) => row.id);
      for (let index = 0; index < transactionIds.length; index += 80) {
        await db.delete(fixedExpensePayments).where(and(
          eq(fixedExpensePayments.ownerEmail, user.email),
          inArray(fixedExpensePayments.transactionId, transactionIds.slice(index, index + 80)),
        ));
      }
      await db.delete(transactions).where(transactionFilter);
    }
    return Response.json({ ok: true, deleted: rows.length });
  }
  return Response.json({ error: "Operazione non valida" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  const payload = (await request.json()) as { id: number; kind?: string };
  if (payload.kind === "fixed-expense") {
    await getDb().delete(fixedExpenseSkips).where(and(eq(fixedExpenseSkips.ownerEmail, user.email), eq(fixedExpenseSkips.fixedExpenseId, Number(payload.id))));
    await getDb().delete(fixedExpensePayments).where(and(eq(fixedExpensePayments.ownerEmail, user.email), eq(fixedExpensePayments.fixedExpenseId, Number(payload.id))));
    await getDb().delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, user.email), eq(fixedExpenseKeywordSources.fixedExpenseId, Number(payload.id))));
    await getDb().delete(fixedExpenses).where(and(eq(fixedExpenses.ownerEmail, user.email), eq(fixedExpenses.id, Number(payload.id))));
    return Response.json({ ok: true });
  }
  if (payload.kind === "category") {
    const current = await getDb()
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, Number(payload.id)),
          eq(categories.ownerEmail, user.email),
        ),
      )
      .limit(1);
    if (!current.length) return Response.json({ ok: true });
    const used = await getDb()
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.ownerEmail, user.email),
          eq(transactions.category, current[0].name),
        ),
      )
      .limit(1);
    if (used.length)
      return Response.json(
        {
          error:
            "Questa categoria è usata da alcuni movimenti. Rinominala invece di eliminarla.",
        },
        { status: 409 },
      );
    await getDb()
      .delete(categoryKeywords)
      .where(and(eq(categoryKeywords.ownerEmail, user.email), eq(categoryKeywords.categoryId, Number(payload.id))));
    await getDb()
      .delete(categories)
      .where(
        and(
          eq(categories.id, Number(payload.id)),
          eq(categories.ownerEmail, user.email),
        ),
      );
    return Response.json({ ok: true });
  }
  if (payload.kind === "account") {
    const accountId = Number(payload.id);
    const own = await getDb()
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
      )
      .limit(1);
    if (!own.length) return Response.json({ ok: true });
    const accountFixedExpenses = await getDb().select({ id: fixedExpenses.id }).from(fixedExpenses).where(and(eq(fixedExpenses.accountId, accountId), eq(fixedExpenses.ownerEmail, user.email)));
    for (const expense of accountFixedExpenses)
      await getDb().delete(fixedExpensePayments).where(and(eq(fixedExpensePayments.ownerEmail, user.email), eq(fixedExpensePayments.fixedExpenseId, expense.id)));
    for (const expense of accountFixedExpenses)
      await getDb().delete(fixedExpenseSkips).where(and(eq(fixedExpenseSkips.ownerEmail, user.email), eq(fixedExpenseSkips.fixedExpenseId, expense.id)));
    for (const expense of accountFixedExpenses)
      await getDb().delete(fixedExpenseKeywordSources).where(and(eq(fixedExpenseKeywordSources.ownerEmail, user.email), eq(fixedExpenseKeywordSources.fixedExpenseId, expense.id)));
    await getDb().delete(fixedExpenses).where(and(eq(fixedExpenses.accountId, accountId), eq(fixedExpenses.ownerEmail, user.email)));
    await getDb()
      .delete(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.ownerEmail, user.email),
        ),
      );
    await getDb()
      .delete(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email)),
      );
    await getDb()
      .delete(accountGoals)
      .where(and(eq(accountGoals.accountId, accountId), eq(accountGoals.ownerEmail, user.email)));
    await getDb()
      .update(userSettings)
      .set({ homeAccountId: null })
      .where(and(eq(userSettings.ownerEmail, user.email), eq(userSettings.homeAccountId, accountId)));
    return Response.json({ ok: true });
  }
  const { id } = payload;
  await getDb().delete(fixedExpensePayments).where(and(
    eq(fixedExpensePayments.transactionId, Number(id)),
    eq(fixedExpensePayments.ownerEmail, user.email),
  ));
  await getDb()
    .delete(transactions)
    .where(
      and(
        eq(transactions.id, Number(id)),
        eq(transactions.ownerEmail, user.email),
      ),
    );
  return Response.json({ ok: true });
}
