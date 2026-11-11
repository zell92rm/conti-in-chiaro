import assert from "node:assert/strict";
import test from "node:test";

const { groupBillsByPeriod, NO_DUE_DATE } = await import("../src/lib/energy-bill-periods.ts");

// Periodo = mese della scadenza (qui semplificato): i test verificano il raggruppamento, non le regole del conto.
const monthOf = (date) => date.slice(0, 7);
const bills = [
  { id: 1, dueDate: "2026-09-26", appliedMonth: "2026-09" },
  { id: 2, dueDate: "2026-11-26", appliedMonth: null },
  { id: 3, dueDate: "2026-11-30", appliedMonth: "2026-11" },
  { id: 4, dueDate: "2026-10-27", appliedMonth: "2026-10" },
  { id: 5, dueDate: null, appliedMonth: null },
];

test("la pagina predefinita è il periodo attuale, con le sue bollette", () => {
  const page = groupBillsByPeriod(bills, monthOf, "2026-11");
  assert.equal(page.month, "2026-11");
  assert.deepEqual(page.bills.map((bill) => bill.id), [3, 2], "più recenti per scadenza");
});

test("periodi dal più recente, con il periodo attuale sempre presente e le bollette senza scadenza in fondo", () => {
  assert.deepEqual(groupBillsByPeriod(bills, monthOf, "2026-11").months, ["2026-11", "2026-10", "2026-09", NO_DUE_DATE]);
  assert.deepEqual(groupBillsByPeriod(bills, monthOf, "2026-12").months, ["2026-12", "2026-11", "2026-10", "2026-09", NO_DUE_DATE]);
  assert.deepEqual(groupBillsByPeriod(bills.slice(0, 1), monthOf, "2026-12").bills, [], "periodo attuale vuoto");
});

test("pagina richiesta: valida, senza scadenza o sconosciuta (torna all'attuale)", () => {
  assert.deepEqual(groupBillsByPeriod(bills, monthOf, "2026-11", "2026-10").bills.map((bill) => bill.id), [4]);
  assert.deepEqual(groupBillsByPeriod(bills, monthOf, "2026-11", NO_DUE_DATE).bills.map((bill) => bill.id), [5]);
  assert.equal(groupBillsByPeriod(bills, monthOf, "2026-11", "1999-01").month, "2026-11");
});

test("una bolletta applicata resta nel periodo in cui è stata applicata", () => {
  const moved = [{ id: 9, dueDate: "2026-12-02", appliedMonth: "2026-11" }];
  assert.deepEqual(groupBillsByPeriod(moved, monthOf, "2026-11").bills.map((bill) => bill.id), [9]);
});
