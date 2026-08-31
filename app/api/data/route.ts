import { and, desc, eq, gte, inArray, lt, lte, notInArray } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { ensureUserSettingsSchema, getDb } from "../../../db";
import {
  accounts,
  accountGoals,
  appFlags,
  budgets,
  categories,
  categoryKeywords,
  fixedExpensePayments,
  fixedExpenseSkips,
  fixedExpenses,
  transactions,
  userSettings,
} from "../../../db/schema";

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
const cleanKeywords = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean),
)).slice(0, 40);
const fingerprint = (
  a: number,
  date: string,
  description: string,
  amount: number,
) =>
  `${a}|${date}|${normalizedImportDescription(description)}|${amount.toFixed(2)}`;
const normalizedImportDescription = (description: string) => description.trim().toLowerCase().replace(/^(?:pagamento|pagamennto)\b[\s\S]*?\bpresso\b[\s\u00a0]*/i, "").replace(/\s+/g, " ");
const importDescriptionsOverlap = (
  left: { description: string; details?: string | null },
  right: { description: string; details?: string | null },
) => {
  const parts = (item: { description: string; details?: string | null }) =>
    [item.description, item.details].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map(normalizedImportDescription);
  const leftParts = parts(left), rightParts = parts(right);
  return leftParts.some((leftPart) => rightParts.some((rightPart) =>
    leftPart === rightPart || (leftPart.length >= 2 && rightPart.length >= 2 && (leftPart.includes(rightPart) || rightPart.includes(leftPart))),
  ));
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
const fixedMatchScore = (name: string, expected: number, description: string, amount: number) => {
  const words = fixedMatchWords(name);
  const normalizedDescription = description.toLowerCase();
  const missingWords = words.filter((word) => !normalizedDescription.includes(word)).length;
  return Math.abs(expected - Math.abs(amount)) + missingWords * 2;
};
const fixedMatchWords = (value: string) => value.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2);
const hasFixedDescriptionMatch = (name: string, description: string) => {
  const nameWords = fixedMatchWords(name), descriptionWords = fixedMatchWords(description);
  const compactName = nameWords.join(""), compactDescription = descriptionWords.join("");
  return compactDescription.includes(compactName) || compactName.includes(compactDescription) ||
    nameWords.some((nameWord) => descriptionWords.some((descriptionWord) => descriptionWord.includes(nameWord) || nameWord.includes(descriptionWord)));
};

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
  const keywordRows = await db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, user.email));
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
  const configuredHomeAccountId = settings[0]?.homeAccountId ?? null;
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
      fixedExpenseId: recurringPayments.find((payment) => payment.transactionId === transaction.id)?.fixedExpenseId ?? null,
    })),
    budgets: b,
    categories: categoryRows.map((category) => ({
      ...category,
      keywords: keywordRows.filter((row) => row.categoryId === category.id).map((row) => row.keyword),
    })),
    fixedExpenses: recurring.map((expense) => ({
      ...expense,
      payments: recurringPayments.filter((payment) => payment.fixedExpenseId === expense.id),
      skippedMonths: recurringSkips.filter((skip) => skip.fixedExpenseId === expense.id).map((skip) => skip.month),
    })),
    homeAccountId,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  await ensureUserSettingsSchema();
  const body = (await request.json()) as Record<string, any>;
  const db = getDb();
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
    const [row] = await db.insert(fixedExpenses).values({
      ownerEmail: user.email,
      accountId,
      name: String(body.name).trim(),
      category: String(body.category || "").trim() || null,
      amount,
      createdAt: now(),
    }).returning();
    const month = new Date().toISOString().slice(0, 7);
    const alreadyLinked = new Set((await db.select({ transactionId: fixedExpensePayments.transactionId }).from(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, user.email))).map((payment) => payment.transactionId));
    const possibleTransactions = (await db.select().from(transactions).where(and(
      eq(transactions.ownerEmail, user.email), eq(transactions.accountId, accountId), gte(transactions.date, `${month}-01`), lt(transactions.date, `${month}-32`),
    ))).filter((transaction) => transaction.amount < 0 && !alreadyLinked.has(transaction.id) && Math.abs(Math.abs(transaction.amount) - amount) <= 5 && hasFixedDescriptionMatch(row.name, transaction.description))
      .sort((left, right) => fixedMatchScore(row.name, amount, left.description, left.amount) - fixedMatchScore(row.name, amount, right.description, right.amount));
    return Response.json({ row: { ...row, payments: [] }, possibleTransactions });
  }
  if (body.action === "fixed-expense-update") {
    const id = Number(body.id), amount = Math.abs(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Importo non valido" }, { status: 400 });
    await db.update(fixedExpenses).set({ amount }).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.ownerEmail, user.email)));
    return Response.json({ ok: true });
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
    if (!expense) return Response.json({ error: "Spesa fissa non valida" }, { status: 400 });
    const alreadyPaid = await db.select({ id: fixedExpensePayments.id }).from(fixedExpensePayments).where(and(
      eq(fixedExpensePayments.ownerEmail, user.email), eq(fixedExpensePayments.fixedExpenseId, fixedExpenseId), eq(fixedExpensePayments.month, month),
    )).limit(1);
    if (alreadyPaid.length) return Response.json({ error: "Questa spesa risulta già pagata" }, { status: 400 });
    const alreadyLinked = new Set((await db.select({ transactionId: fixedExpensePayments.transactionId }).from(fixedExpensePayments).where(
      eq(fixedExpensePayments.ownerEmail, user.email),
    )).map((payment) => payment.transactionId));
    const matches = (await db.select().from(transactions).where(and(
      eq(transactions.ownerEmail, user.email), eq(transactions.accountId, expense.accountId), gte(transactions.date, `${month}-01`), lt(transactions.date, `${month}-32`),
    ))).filter((transaction) => transaction.amount < 0 && !alreadyLinked.has(transaction.id) && Math.abs(Math.abs(transaction.amount) - expense.amount) <= 5 && hasFixedDescriptionMatch(expense.name, transaction.description))
      .sort((left, right) => fixedMatchScore(expense.name, expense.amount, left.description, left.amount) - fixedMatchScore(expense.name, expense.amount, right.description, right.amount))
      .slice(0, 10);
    return Response.json({ matches });
  }
  if (body.action === "fixed-expense-paid") {
    const fixedExpenseId = Number(body.fixedExpenseId), transactionId = Number(body.transactionId);
    const [expense] = await db.select().from(fixedExpenses).where(and(eq(fixedExpenses.id, fixedExpenseId), eq(fixedExpenses.ownerEmail, user.email))).limit(1);
    const [transaction] = await db.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.ownerEmail, user.email))).limit(1);
    if (!expense || !transaction || expense.accountId !== transaction.accountId)
      return Response.json({ error: "Corrispondenza non valida" }, { status: 400 });
    await db.insert(fixedExpensePayments).values({ ownerEmail: user.email, fixedExpenseId, transactionId, month: transaction.date.slice(0, 7), createdAt: now() }).onConflictDoNothing();
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
      const keywords = cleanKeywords(body.keywords);
      if (keywords.length) await db.insert(categoryKeywords).values(keywords.map((keyword) => ({ ownerEmail: user.email, categoryId: row.id, keyword })));
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
    const keywords = cleanKeywords(body.keywords);
    await db.delete(categoryKeywords).where(and(eq(categoryKeywords.ownerEmail, user.email), eq(categoryKeywords.categoryId, Number(body.id))));
    if (keywords.length) await db.insert(categoryKeywords).values(keywords.map((keyword) => ({ ownerEmail: user.email, categoryId: Number(body.id), keyword })));
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
    const fp = fingerprint(accountId, body.date, body.description, amount);
    try {
      const [row] = await db
        .insert(transactions)
        .values({
          ownerEmail: user.email,
          accountId,
          date: body.date,
          description: String(body.description).trim(),
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
          ownerEmail: user.email, fixedExpenseId, transactionId: row.id, month: row.date.slice(0, 7), createdAt: now(),
        }).onConflictDoNothing();
      }
      return Response.json({ row, duplicate: false });
    } catch {
      return Response.json({ duplicate: true });
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
          ownerEmail: user.email, fixedExpenseId, transactionId: id, month: date.slice(0, 7), createdAt: now(),
        }).onConflictDoNothing();
      }
      if (amount < 0 && (body.category || "Altro") !== existing.category) {
        await db
          .update(transactions)
          .set({ category: body.category || "Altro" })
          .where(
            and(
              eq(transactions.ownerEmail, user.email),
              eq(transactions.description, existing.description),
              lt(transactions.amount, 0),
            ),
          );
      }
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "Esiste già un movimento identico" },
        { status: 409 },
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
    const where = existing.amount < 0
      ? and(eq(transactions.ownerEmail, user.email), eq(transactions.description, existing.description), lt(transactions.amount, 0))
      : and(eq(transactions.ownerEmail, user.email), eq(transactions.id, id));
    const updated = await db.update(transactions).set({ category }).where(where).returning({ id: transactions.id });
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
      reconciled = 0;
    const existingTransactions = await db.select({
      date: transactions.date,
      description: transactions.description,
      details: transactions.details,
      amount: transactions.amount,
    }).from(transactions).where(and(
      eq(transactions.ownerEmail, user.email),
      eq(transactions.accountId, accountId),
    ));
    const currentImportFingerprints = new Set<string>();
    for (const item of body.rows || []) {
      const amount = Number(item.amount);
      if (item.categoryEdited === true && amount < 0) {
        await db.update(transactions).set({ category: item.category || "Altro" }).where(
          and(
            eq(transactions.ownerEmail, user.email),
            eq(transactions.description, String(item.description).trim()),
            lt(transactions.amount, 0),
          ),
        );
      }
      const openBankingStatus = importSource === "enable_banking" && (item.bankStatus === "BOOK" || item.bankStatus === "PDNG") ? item.bankStatus : null;
      if (item.confirmUpdate === true) {
        const updateTransactionId = Number(item.updateTransactionId);
        const [existingMatch] = Number.isInteger(updateTransactionId) && updateTransactionId > 0
          ? await db.select().from(transactions).where(and(
            eq(transactions.id, updateTransactionId),
            eq(transactions.ownerEmail, user.email),
            eq(transactions.accountId, accountId),
            eq(transactions.amount, amount),
          )).limit(1)
          : [];
        const incomingDescription = { description: String(item.description), details: typeof item.details === "string" ? item.details : null };
        const dateChanged = existingMatch?.date !== item.date;
        if (!existingMatch || !importDescriptionsOverlap(existingMatch, incomingDescription) || (dateChanged && !(existingMatch.source === "enable_banking" && existingMatch.openBankingStatus === "PDNG"))) {
          return Response.json({ error: "Il movimento selezionato per l’aggiornamento non è più disponibile o non corrisponde." }, { status: 409 });
        }
        const updatedDescription = importDescriptionUpdate(existingMatch, incomingDescription);
        const updatedDate = dateChanged ? String(item.date) : existingMatch.date;
        const updatedOpenBankingStatus = existingMatch.openBankingStatus === "PDNG" && importSource === "enable_banking" && item.bankStatus === "BOOK"
          ? "BOOK"
          : existingMatch.openBankingStatus;
        const updatedFingerprint = fingerprint(accountId, updatedDate, updatedDescription.details || updatedDescription.description, amount);
        try {
          await db.batch([
            db.update(transactions).set({ date: updatedDate, description: updatedDescription.description, details: updatedDescription.details, openBankingStatus: updatedOpenBankingStatus, fingerprint: updatedFingerprint }).where(and(eq(transactions.id, existingMatch.id), eq(transactions.ownerEmail, user.email))),
            db.update(fixedExpensePayments).set({ month: updatedDate.slice(0, 7) }).where(and(eq(fixedExpensePayments.transactionId, existingMatch.id), eq(fixedExpensePayments.ownerEmail, user.email))),
          ]);
          reconciled++;
          continue;
        } catch {
          duplicates++;
          continue;
        }
      }
      if (openBankingStatus === "BOOK") {
        const pendingCandidates = await db.select().from(transactions).where(and(
          eq(transactions.ownerEmail, user.email),
          eq(transactions.accountId, accountId),
          eq(transactions.source, "enable_banking"),
          eq(transactions.openBankingStatus, "PDNG"),
          eq(transactions.amount, amount),
        ));
        const pending = pendingCandidates.find(candidate => importDescriptionsOverlap(candidate, { description: String(item.description), details: typeof item.details === "string" ? item.details : null }));
        if (pending) {
          const updatedFingerprint = fingerprint(accountId, item.date, pending.details || pending.description, amount);
          try {
            await db.batch([
              db.update(transactions).set({ date: item.date, openBankingStatus: "BOOK", fingerprint: updatedFingerprint }).where(and(eq(transactions.id, pending.id), eq(transactions.ownerEmail, user.email))),
              db.update(fixedExpensePayments).set({ month: String(item.date).slice(0, 7) }).where(and(eq(fixedExpensePayments.transactionId, pending.id), eq(fixedExpensePayments.ownerEmail, user.email))),
            ]);
            reconciled++;
            continue;
          } catch {
            duplicates++;
            continue;
          }
        }
      }
      if (item.skip === true) {
        duplicates++;
        continue;
      }
      const baseFingerprint = fingerprint(accountId, item.date, item.details || item.description, amount);
      const matchesExisting = existingTransactions.some((transaction) =>
        transaction.date === item.date &&
        Number(transaction.amount) === amount &&
        importDescriptionsOverlap(transaction, { description: String(item.description), details: typeof item.details === "string" ? item.details : null }),
      );
      if (matchesExisting && item.force !== true) {
        duplicates++;
        continue;
      }
      const fp = item.force === true || currentImportFingerprints.has(baseFingerprint)
        ? `${baseFingerprint}|forced:${crypto.randomUUID()}`
        : baseFingerprint;
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
            ownerEmail: user.email, fixedExpenseId, transactionId: insertedRow.id, month: insertedRow.date.slice(0, 7), createdAt: now(),
          }).onConflictDoNothing();
        }
        currentImportFingerprints.add(baseFingerprint);
        inserted++;
      } catch {
        duplicates++;
      }
    }
    return Response.json({ inserted, duplicates, reconciled });
  }
  if (body.action === "delete-all") {
    await db.delete(fixedExpenseSkips).where(eq(fixedExpenseSkips.ownerEmail, user.email));
    await db.delete(fixedExpensePayments).where(eq(fixedExpensePayments.ownerEmail, user.email));
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
