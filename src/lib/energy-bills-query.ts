// Interrogazioni sulle bollette lette dalle email: elenco per periodo contabile del conto.
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, energyBills } from "../db/schema";
import { accountCycleMonth, accountPeriodBounds } from "./account-period";
import { NO_DUE_DATE, groupBillsByPeriod } from "./energy-bill-periods";
import { romeParts } from "./mail-schedule";

export async function ownEnergyAccount(accountId: number, ownerEmail: string) {
  if (!Number.isInteger(accountId)) return null;
  const [account] = await getDb().select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, ownerEmail))).limit(1);
  return account && ["personale", "spese_mese"].includes(account.type) ? account : null;
}

/**
 * Bollette del periodo richiesto (di default quello attuale del conto), l'elenco dei periodi con bollette per la
 * navigazione avanti/indietro, le date del periodo e quante bollette lette sono ancora da applicare.
 */
export async function billsByPeriod(ownerEmail: string, account: { id: number; type: string }, requestedMonth?: string | null, at = new Date()) {
  const rows = await getDb().select({
    id: energyBills.id, supply: energyBills.supply, consumption: energyBills.consumption, consumptionUnit: energyBills.consumptionUnit, total: energyBills.total,
    dueDate: energyBills.dueDate, periodLabel: energyBills.periodLabel, appliedAt: energyBills.appliedAt, appliedMonth: energyBills.appliedMonth, note: energyBills.note, receivedAt: energyBills.receivedAt,
  }).from(energyBills).where(and(eq(energyBills.accountId, account.id), eq(energyBills.ownerEmail, ownerEmail)));
  const monthOf = (date: string) => accountCycleMonth(date, account.type);
  const currentMonth = accountCycleMonth(romeParts(at).day, account.type);
  const { month, months, bills } = groupBillsByPeriod(rows, monthOf, currentMonth, requestedMonth);
  const bounds = month === NO_DUE_DATE ? null : accountPeriodBounds(month, account.type);
  return {
    bills,
    period: { month, months, current: currentMonth, start: bounds?.start ?? null, end: bounds?.end ?? null },
    pendingBills: rows.filter((bill) => !bill.appliedAt && bill.total !== null).length,
  };
}
