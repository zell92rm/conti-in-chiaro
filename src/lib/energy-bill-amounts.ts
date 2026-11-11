type BillLike = { id: number; dueDate: string | null; total: number | null; receivedAt: string };

/**
 * Totali delle bollette lette dalle email, per mese contabile del conto.
 * `monthOf` converte la data di scadenza nel mese contabile (es. `accountCycleMonth(data, tipoConto)`).
 * Se in un mese ne sono arrivate più di una, per la bolletta principale vale la prima per scadenza.
 */
export function billMonthAmounts(bills: BillLike[], monthOf: (dueDate: string) => string): Record<string, number> {
  const amounts: Record<string, number> = {};
  const ordered = bills
    .filter((bill) => bill.dueDate && bill.total !== null && Number.isFinite(bill.total))
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.receivedAt.localeCompare(b.receivedAt) || a.id - b.id);
  for (const bill of ordered) {
    const month = monthOf(bill.dueDate as string);
    if (!(month in amounts)) amounts[month] = bill.total as number;
  }
  return amounts;
}
