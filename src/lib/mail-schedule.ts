// Pianificazione del servizio di lettura email: orari giornalieri nel fuso Europe/Rome.
export const MAIL_TIMEZONE = "Europe/Rome";
export const DEFAULT_TIMES = ["12:00", "23:30"];
const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MAIL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Data e ora locali (Europe/Rome) come "AAAA-MM-GG" e "HH:MM". */
export function romeParts(date: Date): { day: string; time: string } {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTime = (value: unknown): value is string => typeof value === "string" && TIME_PATTERN.test(value);

/** Normalizza una lista di orari "HH:MM": validi, senza doppioni, ordinati (massimo 4). Se vuota usa quelli predefiniti. */
export function normalizeTimes(value: unknown): string[] {
  let list: unknown = value;
  if (typeof value === "string") { try { list = JSON.parse(value); } catch { list = []; } }
  const times = Array.isArray(list) ? Array.from(new Set(list.filter(isValidTime))).sort().slice(0, 4) : [];
  return times.length ? times : [...DEFAULT_TIMES];
}

export type ScheduleState = {
  enabled: boolean;
  times: string[];
  lastRunAt: string | null;
  runRequestedAt: string | null;
  runningSince: string | null;
};

/** Ultimo orario previsto già trascorso (oggi o, se oggi nessuno è passato, l'ultimo di ieri) come "AAAA-MM-GG HH:MM". */
export function latestSlot(times: string[], now: Date): string {
  const { day, time } = romeParts(now);
  const sorted = [...times].sort();
  const passedToday = sorted.filter((slot) => slot <= time).at(-1);
  if (passedToday) return `${day} ${passedToday}`;
  const yesterday = romeParts(new Date(now.getTime() - 24 * 3600 * 1000)).day;
  return `${yesterday} ${sorted.at(-1)}`;
}

/** Decide se la configurazione va eseguita ora (richiesta manuale o orario previsto non ancora eseguito). */
export function dueReason(state: ScheduleState, now: Date): "manual" | "scheduled" | null {
  if (state.runningSince && now.getTime() - new Date(state.runningSince).getTime() < RUNNING_TIMEOUT_MS) return null;
  if (state.runRequestedAt && (!state.lastRunAt || state.runRequestedAt > state.lastRunAt)) return "manual";
  if (!state.enabled) return null;
  if (!state.lastRunAt) return "scheduled";
  const last = romeParts(new Date(state.lastRunAt));
  return `${last.day} ${last.time}` < latestSlot(state.times, now) ? "scheduled" : null;
}

export type ReadMode = "incremental" | "full";

/**
 * Da quale giorno leggere le email (AAAA-MM-GG, fuso Europe/Rome), oppure null = tutta la casella.
 * Scansione completa o prima lettura: tutto. Letture successive: solo il giorno corrente.
 */
export function readSince(lastSuccessAt: string | null, mode: ReadMode, now: Date): string | null {
  if (mode === "full" || !lastSuccessAt) return null;
  return romeParts(now).day;
}
