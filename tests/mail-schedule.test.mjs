import assert from "node:assert/strict";
import test from "node:test";

const { dueReason, latestSlot, normalizeTimes, romeParts } = await import("../src/lib/mail-schedule.ts");
const { billMonthAmounts } = await import("../src/lib/energy-bill-amounts.ts");

// Novembre: Europe/Rome = UTC+1.
const at = (iso) => new Date(iso);
const base = { enabled: true, times: ["12:00", "23:30"], lastRunAt: null, runRequestedAt: null, runningSince: null };

test("orari locali Europe/Rome", () => {
  assert.deepEqual(romeParts(at("2026-11-11T11:00:00Z")), { day: "2026-11-11", time: "12:00" });
  assert.deepEqual(romeParts(at("2026-07-11T10:00:00Z")), { day: "2026-07-11", time: "12:00" }); // ora legale
});

test("normalizeTimes: validi, ordinati, senza doppioni, con predefiniti", () => {
  assert.deepEqual(normalizeTimes(["23:30", "12:00", "12:00", "25:00", "x"]), ["12:00", "23:30"]);
  assert.deepEqual(normalizeTimes("[]"), ["12:00", "23:30"]);
  assert.deepEqual(normalizeTimes(undefined), ["12:00", "23:30"]);
});

test("latestSlot: oggi se passato, altrimenti l'ultimo di ieri", () => {
  assert.equal(latestSlot(["12:00", "23:30"], at("2026-11-11T14:00:00Z")), "2026-11-11 12:00");
  assert.equal(latestSlot(["12:00", "23:30"], at("2026-11-11T22:45:00Z")), "2026-11-11 23:30");
  assert.equal(latestSlot(["12:00", "23:30"], at("2026-11-11T07:00:00Z")), "2026-11-10 23:30");
});

test("parte alle 12:00 e alle 23:30, una sola volta", () => {
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-10T22:31:00Z" }, at("2026-11-11T10:59:00Z")), null);
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-10T22:31:00Z" }, at("2026-11-11T11:00:30Z")), "scheduled");
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-11T11:00:40Z" }, at("2026-11-11T11:05:00Z")), null);
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-11T11:00:40Z" }, at("2026-11-11T22:30:00Z")), "scheduled");
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-11T22:30:20Z" }, at("2026-11-11T22:40:00Z")), null);
});

test("esecuzione mancata durante la notte: parte al riavvio", () => {
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-10T11:00:00Z" }, at("2026-11-11T07:00:00Z")), "scheduled");
});

test("prima esecuzione, disabilitata, manuale e in corso", () => {
  assert.equal(dueReason(base, at("2026-11-11T08:00:00Z")), "scheduled");
  assert.equal(dueReason({ ...base, enabled: false }, at("2026-11-11T08:00:00Z")), null);
  assert.equal(dueReason({ ...base, enabled: false, runRequestedAt: "2026-11-11T08:00:00Z" }, at("2026-11-11T08:00:05Z")), "manual");
  assert.equal(dueReason({ ...base, lastRunAt: "2026-11-11T08:00:10Z", runRequestedAt: "2026-11-11T08:00:00Z" }, at("2026-11-11T08:10:00Z")), null);
  assert.equal(dueReason({ ...base, runningSince: "2026-11-11T08:00:00Z" }, at("2026-11-11T08:05:00Z")), null);
  assert.equal(dueReason({ ...base, runningSince: "2026-11-11T08:00:00Z" }, at("2026-11-11T08:20:00Z")), "scheduled");
});

test("billMonthAmounts: mese contabile della scadenza, prima bolletta per scadenza", () => {
  const bills = [
    { id: 2, dueDate: "2026-11-30", total: 42.96, receivedAt: "2026-11-06T08:00:00Z" },
    { id: 1, dueDate: "2026-11-26", total: 48.35, receivedAt: "2026-11-05T08:00:00Z" },
    { id: 3, dueDate: "2026-10-26", total: 40, receivedAt: "2026-10-05T08:00:00Z" },
    { id: 4, dueDate: null, total: 9, receivedAt: "2026-10-05T08:00:00Z" },
  ];
  assert.deepEqual(billMonthAmounts(bills, (date) => date.slice(0, 7)), { "2026-10": 40, "2026-11": 48.35 });
});

test("readSince: prima lettura e scansione completa = tutta la casella, poi solo il giorno corrente", async () => {
  const { readSince } = await import("../src/lib/mail-schedule.ts");
  const nowDate = new Date("2026-11-11T11:00:00Z");
  assert.equal(readSince(null, "incremental", nowDate), null);
  assert.equal(readSince("2026-11-10T22:31:00Z", "full", nowDate), null);
  assert.equal(readSince("2026-11-10T22:31:00Z", "incremental", nowDate), "2026-11-11");
  // alle 23:30 italiane (22:30 UTC) il "giorno corrente" è ancora quello italiano
  assert.equal(readSince("2026-11-11T11:00:00Z", "incremental", new Date("2026-11-11T22:30:00Z")), "2026-11-11");
  assert.equal(readSince("2026-11-11T11:00:00Z", "incremental", new Date("2026-11-11T23:30:00Z")), "2026-11-12");
});
