// Lettura automatica delle email di bolletta: pianificazione, salvataggio e applicazione agli importi previsti.
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, energyBills, energyMailConfigs, fixedExpenseMonthAmounts, fixedExpenses } from "../db/schema";
import { accountCycleMonth, accountPeriodBounds } from "./account-period";
import { GMAIL_IMAP, getEnergyProvider, isSupply } from "./energy-providers";
import { dueReason, normalizeTimes, readSince, romeParts, type ReadMode } from "./mail-schedule";
import { parseOctopusBill, type ParsedBill } from "./octopus-bill";
import { decryptSecret } from "./open-banking-crypto";

export const passwordContext = (ownerEmail: string, accountId: number) => `energy-mail:${ownerEmail}:${accountId}`;

export type MailJob = {
  configId: number;
  user: string;
  password: string;
  host: string;
  port: number;
  senderDomain: string;
  subjectContains: string;
  /** AAAA-MM-GG: leggi solo le email da questa data; null = tutta la casella (prima esecuzione o scansione completa). */
  since: string | null;
  mode: ReadMode;
  reason: "manual" | "scheduled";
};

export type IncomingMail = { emailId: string; subject: string; date: string; text?: string | null; html?: string | null };
export type RunSummary = { read: number; ignored: number; added: number; updated: number; applied: number; notes: string[]; full?: boolean };

const now = () => new Date().toISOString();

/** Configurazioni da eseguire ora; le segna "in esecuzione" per evitare doppie partenze. */
export async function claimDueJobs(at = new Date()): Promise<MailJob[]> {
  const db = getDb();
  const configs = await db.select().from(energyMailConfigs);
  const jobs: MailJob[] = [];
  for (const config of configs) {
    const reason = dueReason({
      enabled: config.enabled, times: normalizeTimes(config.times), lastRunAt: config.lastRunAt,
      runRequestedAt: config.runRequestedAt, runningSince: config.runningSince,
    }, at);
    const provider = getEnergyProvider(config.provider);
    if (!reason || !provider) continue;
    let password: string;
    try { password = await decryptSecret(config.encryptedPassword, config.passwordIv, passwordContext(config.ownerEmail, config.accountId)); }
    catch { await db.update(energyMailConfigs).set({ lastRunAt: at.toISOString(), lastStatus: "error", lastError: "Impossibile decifrare la password salvata: reinseriscila." }).where(eq(energyMailConfigs.id, config.id)); continue; }
    await db.update(energyMailConfigs).set({ runningSince: at.toISOString() }).where(eq(energyMailConfigs.id, config.id));
    // Scansione completa solo se richiesta; le letture normali guardano solo il giorno corrente (la prima legge tutta la casella).
    const mode: ReadMode = reason === "manual" && config.runMode === "full" ? "full" : "incremental";
    const since = readSince(config.lastSuccessAt, mode, at);
    jobs.push({
      configId: config.id, user: config.imapUser, password, host: GMAIL_IMAP.host, port: GMAIL_IMAP.port,
      senderDomain: provider.senderDomain, subjectContains: provider.subjectContains, since, mode, reason,
    });
  }
  return jobs;
}

/** Salva le email nuove (scartando quelle già presenti con lo stesso identificativo) e restituisce quante. */
export async function ingestMails(ownerEmail: string, accountId: number, provider: string, mails: IncomingMail[], options: { refresh?: boolean } = {}) {
  const db = getDb();
  const summary: RunSummary = { read: mails.length, ignored: 0, added: 0, updated: 0, applied: 0, notes: [] };
  for (const mail of mails) {
    const parsed: ParsedBill | null = provider === "octopus" ? parseOctopusBill({ subject: mail.subject, text: mail.text, html: mail.html }) : null;
    if (!parsed || !mail.emailId) { summary.ignored++; continue; }
    const inserted = await db.insert(energyBills).values({
      ownerEmail, accountId, provider, emailId: mail.emailId, receivedAt: mail.date || now(), supply: parsed.supply,
      consumption: parsed.consumption, consumptionUnit: parsed.consumptionUnit, total: parsed.total, dueDate: parsed.dueDate,
      periodLabel: parsed.periodLabel, subject: mail.subject.slice(0, 300), note: parsed.note, createdAt: now(),
    }).onConflictDoNothing().returning({ id: energyBills.id });
    if (inserted.length) { summary.added++; continue; }
    if (!options.refresh) continue;
    // Scansione completa: completa i dati che nella lettura precedente non erano stati riconosciuti (senza toccare quelli già presenti).
    const [existing] = await db.select().from(energyBills).where(and(eq(energyBills.ownerEmail, ownerEmail), eq(energyBills.emailId, mail.emailId))).limit(1);
    if (!existing) continue;
    const patch: Partial<typeof energyBills.$inferInsert> = {};
    if (existing.consumption === null && parsed.consumption !== null) patch.consumption = parsed.consumption;
    if (existing.consumptionUnit === null && parsed.consumptionUnit !== null) patch.consumptionUnit = parsed.consumptionUnit;
    if (existing.total === null && parsed.total !== null) patch.total = parsed.total;
    if (existing.dueDate === null && parsed.dueDate !== null) patch.dueDate = parsed.dueDate;
    if (existing.periodLabel === null && parsed.periodLabel !== null) patch.periodLabel = parsed.periodLabel;
    if (!existing.appliedAt && existing.note !== parsed.note && (Object.keys(patch).length || existing.note?.startsWith("Campi non riconosciuti"))) patch.note = parsed.note;
    if (Object.keys(patch).length) { await db.update(energyBills).set(patch).where(eq(energyBills.id, existing.id)); summary.updated++; }
  }
  return summary;
}

const extraName = (name: string, index: number) => `${name} (${index + 1}ª bolletta)`;

/**
 * Applica le bollette non ancora applicate la cui scadenza cade nel periodo attuale del conto:
 * aggiorna l'importo del mese della bolletta principale con la stessa fornitura; dalla seconda bolletta
 * dello stesso periodo in poi usa (o crea) la "bolletta extra" collegata alla principale.
 */
export async function applyPendingBills(ownerEmail: string, accountId: number, at = new Date()) {
  const db = getDb();
  const notes: string[] = [];
  let applied = 0;
  const [account] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, ownerEmail))).limit(1);
  if (!account) return { applied, notes: ["Conto non trovato"] };
  const today = romeParts(at).day;
  const currentMonth = accountCycleMonth(today, account.type);
  const period = accountPeriodBounds(currentMonth, account.type);
  const bills = await db.select().from(energyBills).where(and(eq(energyBills.ownerEmail, ownerEmail), eq(energyBills.accountId, accountId), isNull(energyBills.appliedAt))).orderBy(asc(energyBills.dueDate), asc(energyBills.receivedAt), asc(energyBills.id));
  const pending = bills.filter((bill) => isSupply(bill.supply) && bill.total !== null && bill.dueDate && bill.dueDate >= period.start && bill.dueDate <= period.end);
  for (const bill of pending) {
    const month = accountCycleMonth(bill.dueDate as string, account.type);
    const expenses = await db.select().from(fixedExpenses).where(and(eq(fixedExpenses.ownerEmail, ownerEmail), eq(fixedExpenses.accountId, accountId), eq(fixedExpenses.supply, bill.supply), eq(fixedExpenses.variable, true)));
    const main = expenses.find((expense) => expense.active && !expense.onlyMonth && !expense.keywordsFromId);
    if (!main) {
      const note = `Nessuna bolletta variabile con fornitura ${bill.supply === "luce" ? "Luce" : "Gas"} nel conto`;
      await db.update(energyBills).set({ note }).where(eq(energyBills.id, bill.id));
      if (!notes.includes(note)) notes.push(note);
      continue;
    }
    const alreadyApplied = (await db.select({ id: energyBills.id }).from(energyBills).where(and(eq(energyBills.ownerEmail, ownerEmail), eq(energyBills.accountId, accountId), eq(energyBills.supply, bill.supply), eq(energyBills.appliedMonth, month)))).length;
    let target = main;
    if (alreadyApplied > 0) {
      const extras = expenses.filter((expense) => expense.keywordsFromId === main.id && expense.onlyMonth === month).sort((a, b) => a.id - b.id);
      const existing = extras[alreadyApplied - 1];
      if (existing) target = existing;
      else {
        const [created] = await db.insert(fixedExpenses).values({
          ownerEmail, accountId, name: extraName(main.name, alreadyApplied), notes: main.notes, category: main.category, keywords: "[]",
          amount: bill.total as number, variable: true, onlyMonth: month, keywordsFromId: main.id, supply: bill.supply, active: true, createdAt: now(),
        }).returning();
        target = created;
      }
    }
    await db.insert(fixedExpenseMonthAmounts).values({ ownerEmail, fixedExpenseId: target.id, month, amount: bill.total as number, createdAt: now() })
      .onConflictDoUpdate({ target: [fixedExpenseMonthAmounts.fixedExpenseId, fixedExpenseMonthAmounts.month], set: { amount: bill.total as number } });
    await db.update(energyBills).set({ appliedAt: now(), appliedExpenseId: target.id, appliedMonth: month, note: null }).where(eq(energyBills.id, bill.id));
    applied++;
  }
  return { applied, notes };
}

/** Registra l'esito di un'esecuzione ricevuta dal worker (messaggi letti oppure errore). */
export async function recordRunResult(configId: number, result: { mails?: IncomingMail[]; error?: string }) {
  const db = getDb();
  const [config] = await db.select().from(energyMailConfigs).where(eq(energyMailConfigs.id, configId)).limit(1);
  if (!config) return { ok: false as const, error: "Configurazione non trovata" };
  const finishedAt = now();
  if (result.error) {
    await db.update(energyMailConfigs).set({ lastRunAt: finishedAt, runningSince: null, runMode: null, lastStatus: "error", lastError: result.error.slice(0, 500) }).where(eq(energyMailConfigs.id, configId));
    return { ok: true as const };
  }
  const full = config.runMode === "full";
  const summary = await ingestMails(config.ownerEmail, config.accountId, config.provider, result.mails || [], { refresh: full || !config.lastSuccessAt });
  summary.full = full;
  const applyResult = await applyPendingBills(config.ownerEmail, config.accountId);
  summary.applied = applyResult.applied;
  summary.notes = applyResult.notes;
  await db.update(energyMailConfigs).set({
    lastRunAt: finishedAt, lastSuccessAt: finishedAt, runningSince: null, runMode: null, lastStatus: "ok", lastError: null, lastSummary: JSON.stringify(summary),
  }).where(eq(energyMailConfigs.id, configId));
  return { ok: true as const, summary };
}
