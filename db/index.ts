import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

let settingsSchemaReady: Promise<unknown> | null = null;

export function ensureUserSettingsSchema() {
  settingsSchemaReady ??= env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS user_settings (
        owner_email TEXT PRIMARY KEY NOT NULL,
        home_account_id INTEGER
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS account_goals (
        account_id INTEGER PRIMARY KEY NOT NULL,
        owner_email TEXT NOT NULL,
        amount REAL NOT NULL
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS category_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        owner_email TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        keyword TEXT NOT NULL,
        UNIQUE(owner_email, category_id, keyword)
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS app_flags (
        id TEXT PRIMARY KEY NOT NULL,
        owner_email TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        owner_email TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL
      )`,
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_fixed_expenses_owner_account ON fixed_expenses(owner_email, account_id)"),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS fixed_expense_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        owner_email TEXT NOT NULL,
        fixed_expense_id INTEGER NOT NULL,
        transaction_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(fixed_expense_id, month),
        UNIQUE(transaction_id)
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS fixed_expense_skips (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        owner_email TEXT NOT NULL,
        fixed_expense_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(fixed_expense_id, month)
      )`,
    ),
  ]);
  return settingsSchemaReady;
}
