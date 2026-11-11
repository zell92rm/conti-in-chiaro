// Importo previsto delle spese fisse. Le spese "variabili" (bollette) hanno un importo per mese.
export type FixedAmountSource = {
  amount: number;
  variable?: boolean | null;
  onlyMonth?: string | null;
  monthAmounts?: Record<string, number> | null;
  paidAmounts?: Record<string, number> | null;
  /** Totali delle bollette lette dalle email (mese contabile → importo), per la stessa fornitura. */
  billAmounts?: Record<string, number> | null;
};
export type ExpectedAmount = { amount: number; source: "set" | "bill" | "last-year" | "previous" | "base"; from?: string };

export const isMonthKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Una spesa "solo per un mese" vale solo nel proprio mese contabile. */
export function appliesToMonth(expense: { onlyMonth?: string | null }, month: string) {
  return !expense.onlyMonth || expense.onlyMonth === month;
}

/**
 * Importo previsto per `month`:
 * 1) valore salvato per il mese; 2) bolletta letta dalle email per il mese;
 * 3) stesso mese dell'anno prima (salvato, letto da email o realmente pagato);
 * 4) ultimo valore precedente tra importi salvati e bollette lette; 5) importo di base.
 * Le spese non variabili usano sempre l'importo di base.
 */
export function expectedAmountInfo(expense: FixedAmountSource, month: string): ExpectedAmount {
  if (!expense.variable) return { amount: expense.amount, source: "base" };
  const saved = expense.monthAmounts || {};
  if (Number.isFinite(saved[month])) return { amount: saved[month], source: "set", from: month };
  const bills = expense.billAmounts || {};
  if (Number.isFinite(bills[month])) return { amount: bills[month], source: "bill", from: month };
  const lastYear = shiftMonth(month, -12);
  const lastYearValue = [saved[lastYear], bills[lastYear], expense.paidAmounts?.[lastYear]].find((value) => value !== undefined && Number.isFinite(value));
  if (lastYearValue !== undefined) return { amount: lastYearValue, source: "last-year", from: lastYear };
  const previous = Array.from(new Set([...Object.keys(saved), ...Object.keys(bills)])).filter((key) => key < month && (Number.isFinite(saved[key]) || Number.isFinite(bills[key]))).sort().at(-1);
  if (previous) return { amount: Number.isFinite(saved[previous]) ? saved[previous] : bills[previous], source: "previous", from: previous };
  return { amount: expense.amount, source: "base" };
}
export const expectedAmount = (expense: FixedAmountSource, month: string) => expectedAmountInfo(expense, month).amount;
