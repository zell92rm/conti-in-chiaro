import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  singleton: integer("singleton").notNull().default(1).unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("idx_sessions_user_id").on(table.userId)]);

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const userOpenBankingConfig = sqliteTable("user_open_banking_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  applicationId: text("application_id").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  privateKeyIv: text("private_key_iv").notNull(),
  status: text("status").notNull().default("NOT_CONFIGURED"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("user_open_banking_config_user_provider_unique").on(table.userId, table.provider)]);

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#173f35"),
  type: text("type").notNull().default("personale"),
  createdAt: text("created_at").notNull(),
});

export const openBankingAuthorizations = sqliteTable("open_banking_authorizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  stateHash: text("state_hash").notNull().unique(),
  bankName: text("bank_name").notNull(),
  bankCountry: text("bank_country").notNull(),
  psuType: text("psu_type").notNull(),
  authorizationId: text("authorization_id"),
  sessionId: text("session_id"),
  authorizedAccounts: text("authorized_accounts"),
  status: text("status").notNull().default("PENDING"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_open_banking_authorizations_user_account").on(table.userId, table.accountId)]);

export const accountOpenBankingLinks = sqliteTable("account_open_banking_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("ENABLE_BANKING"),
  sessionId: text("session_id").notNull(),
  accountUid: text("account_uid").notNull(),
  bankName: text("bank_name").notNull(),
  bankCountry: text("bank_country").notNull(),
  status: text("status").notNull().default("ENABLED"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("account_open_banking_links_account_provider_unique").on(table.accountId, table.provider),
  index("idx_account_open_banking_links_user").on(table.userId),
]);

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  accountId: integer("account_id").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  details: text("details"),
  amount: real("amount").notNull(),
  category: text("category").notNull().default("Altro"),
  source: text("source").notNull().default("manuale"),
  openBankingStatus: text("open_banking_status"),
  spreadAcrossWeeks: integer("spread_across_weeks", { mode: "boolean" }).notNull().default(false),
  fingerprint: text("fingerprint").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("transactions_owner_fingerprint_unique").on(table.ownerEmail, table.fingerprint)]);

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  month: text("month").notNull(),
  amount: real("amount").notNull(),
}, (table) => [uniqueIndex("budgets_owner_month_unique").on(table.ownerEmail, table.month)]);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#4e8d7c"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("categories_owner_name_unique").on(table.ownerEmail, table.name)]);

export const userSettings = sqliteTable("user_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  homeAccountId: integer("home_account_id"),
});

export const accountGoals = sqliteTable("account_goals", {
  accountId: integer("account_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  amount: real("amount").notNull(),
});

export const categoryKeywords = sqliteTable("category_keywords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  categoryId: integer("category_id").notNull(),
  keyword: text("keyword").notNull(),
}, (table) => [uniqueIndex("category_keywords_owner_category_keyword_unique").on(table.ownerEmail, table.categoryId, table.keyword)]);

export const appFlags = sqliteTable("app_flags", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
});

export const fixedExpenses = sqliteTable("fixed_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  accountId: integer("account_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  amount: real("amount").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_fixed_expenses_owner_account").on(table.ownerEmail, table.accountId)]);

export const fixedExpensePayments = sqliteTable("fixed_expense_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  fixedExpenseId: integer("fixed_expense_id").notNull(),
  transactionId: integer("transaction_id").notNull(),
  month: text("month").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("fixed_expense_payments_expense_month_unique").on(table.fixedExpenseId, table.month),
  uniqueIndex("fixed_expense_payments_transaction_unique").on(table.transactionId),
]);

export const fixedExpenseSkips = sqliteTable("fixed_expense_skips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  fixedExpenseId: integer("fixed_expense_id").notNull(),
  month: text("month").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("fixed_expense_skips_expense_month_unique").on(table.fixedExpenseId, table.month)]);
