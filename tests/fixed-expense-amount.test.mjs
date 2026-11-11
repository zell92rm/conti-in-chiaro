import assert from "node:assert/strict";
import test from "node:test";

const { appliesToMonth, expectedAmount, expectedAmountInfo, shiftMonth, isMonthKey } = await import("../src/lib/fixed-expense-amount.ts");

const bill = { amount: 50, variable: true, monthAmounts: { "2026-01": 120, "2026-12": 70 }, paidAmounts: { "2026-02": 95 } };

test("shiftMonth e isMonthKey", () => {
  assert.equal(shiftMonth("2027-01", -12), "2026-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
  assert.equal(isMonthKey("2026-13"), false);
  assert.equal(isMonthKey("2026-07"), true);
});

test("usa il valore salvato per il mese", () => {
  assert.deepEqual(expectedAmountInfo(bill, "2026-12"), { amount: 70, source: "set", from: "2026-12" });
});

test("preferisce lo stesso mese dell'anno prima al mese precedente", () => {
  assert.deepEqual(expectedAmountInfo(bill, "2027-01"), { amount: 120, source: "last-year", from: "2026-01" });
});

test("usa l'importo realmente pagato l'anno prima se manca il valore salvato", () => {
  assert.equal(expectedAmount(bill, "2027-02"), 95);
});

test("senza storico dell'anno prima usa l'ultimo valore precedente, poi la base", () => {
  assert.deepEqual(expectedAmountInfo(bill, "2027-05"), { amount: 70, source: "previous", from: "2026-12" });
  assert.deepEqual(expectedAmountInfo({ amount: 50, variable: true }, "2027-05"), { amount: 50, source: "base" });
});

test("le spese non variabili usano sempre l'importo di base", () => {
  assert.equal(expectedAmount({ amount: 30, variable: false, monthAmounts: { "2026-01": 99 } }, "2026-01"), 30);
});

test("appliesToMonth limita le spese di un solo mese", () => {
  assert.equal(appliesToMonth({ onlyMonth: null }, "2026-05"), true);
  assert.equal(appliesToMonth({ onlyMonth: "2026-05" }, "2026-05"), true);
  assert.equal(appliesToMonth({ onlyMonth: "2026-05" }, "2026-06"), false);
});

test("le bollette lette dalle email sono una fonte dell'importo previsto", () => {
  const withBills = { amount: 50, variable: true, billAmounts: { "2026-10": 42.96, "2025-11": 80 } };
  // bolletta letta per il mese: precede tutto il resto
  assert.deepEqual(expectedAmountInfo({ ...withBills, monthAmounts: { "2026-10": 10 } }, "2026-10"), { amount: 10, source: "set", from: "2026-10" });
  assert.deepEqual(expectedAmountInfo(withBills, "2026-10"), { amount: 42.96, source: "bill", from: "2026-10" });
  // mese nuovo senza email: stesso mese dell'anno prima letto dalle email
  assert.deepEqual(expectedAmountInfo(withBills, "2026-11"), { amount: 80, source: "last-year", from: "2025-11" });
  // altrimenti l'ultima bolletta letta
  assert.deepEqual(expectedAmountInfo(withBills, "2026-12"), { amount: 42.96, source: "previous", from: "2026-10" });
  // tra importo salvato e bolletta letta nello stesso mese precedente vince il salvato
  assert.equal(expectedAmount({ amount: 5, variable: true, monthAmounts: { "2026-10": 44 }, billAmounts: { "2026-10": 42.96 } }, "2026-12"), 44);
});

test("le bollette lette non cambiano le spese non variabili", () => {
  assert.equal(expectedAmount({ amount: 30, variable: false, billAmounts: { "2026-10": 99 } }, "2026-10"), 30);
});
