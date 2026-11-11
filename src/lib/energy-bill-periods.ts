// Raggruppamento delle bollette lette per periodo contabile del conto (una "pagina" per periodo).
export type PeriodBill = { id: number; dueDate: string | null; appliedMonth: string | null };

/** Pagina speciale per le bollette di cui non è stato riconosciuta la scadenza. */
export const NO_DUE_DATE = "senza-scadenza";

/**
 * Le bollette si raggruppano per il periodo contabile in cui cade la scadenza (lo stesso in cui vengono applicate).
 * `monthOf` converte una data nel periodo contabile del conto; `currentMonth` è il periodo attuale (pagina predefinita).
 * Restituisce i periodi disponibili dal più recente (il periodo attuale c'è sempre) e le bollette di quello richiesto.
 */
export function groupBillsByPeriod<T extends PeriodBill>(bills: T[], monthOf: (dueDate: string) => string, currentMonth: string, requested?: string | null) {
  const byMonth = new Map<string, T[]>();
  for (const bill of bills) {
    const key = bill.appliedMonth || (bill.dueDate ? monthOf(bill.dueDate) : NO_DUE_DATE);
    const list = byMonth.get(key);
    if (list) list.push(bill); else byMonth.set(key, [bill]);
  }
  const periods = Array.from(byMonth.keys()).filter((key) => key !== NO_DUE_DATE);
  if (!periods.includes(currentMonth)) periods.push(currentMonth);
  periods.sort().reverse();
  const months = byMonth.has(NO_DUE_DATE) ? [...periods, NO_DUE_DATE] : periods;
  const month = requested && months.includes(requested) ? requested : currentMonth;
  const list = [...(byMonth.get(month) || [])].sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || "") || b.id - a.id);
  return { month, months, bills: list };
}
