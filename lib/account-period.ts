export type AccountPeriodType = "personale" | "risparmi" | "spese_mese" | string;

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = (date: Date) => dateKey(date).slice(0, 7);

function italianEasterMonday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  const result = new Date(year, month - 1, day, 12); result.setDate(result.getDate() + 1); return result;
}

function isRomeWorkingDay(date: Date) {
  if (date.getDay() === 0 || date.getDay() === 6) return false;
  const fixed = new Set(["01-01", "01-06", "04-25", "05-01", "06-02", "06-29", "08-15", "11-01", "12-08", "12-25", "12-26"]);
  if (fixed.has(dateKey(date).slice(5))) return false;
  const easterMonday = italianEasterMonday(date.getFullYear());
  return date.getMonth() !== easterMonday.getMonth() || date.getDate() !== easterMonday.getDate();
}

function lastWorkingDay(year: number, monthIndex: number) {
  const date = new Date(year, monthIndex + 1, 0, 12);
  while (!isRomeWorkingDay(date)) date.setDate(date.getDate() - 1);
  return date;
}

function fridayCycleStart(monthStart: Date) {
  const next = new Date(monthStart); next.setDate(monthStart.getDate() + ((5 - monthStart.getDay() + 7) % 7));
  const previous = new Date(next); previous.setDate(previous.getDate() - 7);
  return Math.round((monthStart.getTime() - previous.getTime()) / 86400000) <= 1 ? previous : next;
}

export function accountPeriodBounds(month: string, type: AccountPeriodType) {
  const monthStart = new Date(`${month}-01T12:00:00`);
  if (type === "personale") {
    const start = lastWorkingDay(monthStart.getFullYear(), monthStart.getMonth() - 1);
    const end = lastWorkingDay(monthStart.getFullYear(), monthStart.getMonth()); end.setDate(end.getDate() - 1);
    return { start: dateKey(start), end: dateKey(end) };
  }
  if (type === "spese_mese") {
    const start = fridayCycleStart(monthStart);
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 12);
    const end = fridayCycleStart(nextMonth); end.setDate(end.getDate() - 1);
    return { start: dateKey(start), end: dateKey(end) };
  }
  return { start: `${month}-01`, end: dateKey(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12)) };
}

export function accountCycleMonth(dateValue: string, type: AccountPeriodType) {
  if (type === "risparmi") return dateValue.slice(0, 7);
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00`);
  for (const offset of [-1, 0, 1]) {
    const candidate = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
    const key = monthKey(candidate), bounds = accountPeriodBounds(key, type);
    if (dateValue.slice(0, 10) >= bounds.start && dateValue.slice(0, 10) <= bounds.end) return key;
  }
  return dateValue.slice(0, 7);
}
