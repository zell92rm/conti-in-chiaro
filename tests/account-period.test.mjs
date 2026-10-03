import assert from "node:assert/strict";
import test from "node:test";

const { accountCycleMonth, accountPeriodBounds } = await import(
  "../src/lib/account-period.ts"
);

test("starts a monthly-expenses period on the previous Friday when the month begins by Monday", () => {
  assert.equal(accountPeriodBounds("2026-08", "spese_mese").start, "2026-07-31"); // Saturday
  assert.equal(accountPeriodBounds("2026-11", "spese_mese").start, "2026-10-30"); // Sunday
  assert.equal(accountPeriodBounds("2027-02", "spese_mese").start, "2027-01-29"); // Monday
});

test("starts on the first Friday when the previous Friday is more than three days away", () => {
  assert.equal(accountPeriodBounds("2026-09", "spese_mese").start, "2026-09-04"); // Tuesday
  assert.equal(accountPeriodBounds("2027-01", "spese_mese").start, "2027-01-01"); // Friday
});

test("assigns the 30 October 2026 week to the November period", () => {
  assert.deepEqual(accountPeriodBounds("2026-10", "spese_mese"), {
    start: "2026-10-02",
    end: "2026-10-29",
  });
  assert.deepEqual(accountPeriodBounds("2026-11", "spese_mese"), {
    start: "2026-10-30",
    end: "2026-12-03",
  });
  assert.equal(accountCycleMonth("2026-10-29", "spese_mese"), "2026-10");
  assert.equal(accountCycleMonth("2026-10-30", "spese_mese"), "2026-11");
  assert.equal(accountCycleMonth("2026-11-05", "spese_mese"), "2026-11");
});
