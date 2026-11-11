// Lettura delle email di bolletta di Octopus Energy.
// L'email è riconosciuta dall'oggetto ("La tua bolletta Octopus Energy - Luce|Gas", con altro testo prima/dopo).
import type { EnergySupply } from "./energy-providers";

export type ParsedBill = {
  supply: EnergySupply;
  consumption: number | null;
  consumptionUnit: string | null;
  total: number | null;
  /** AAAA-MM-GG */
  dueDate: string | null;
  periodLabel: string | null;
  /** Valorizzata se qualche campo non è stato riconosciuto. */
  note: string | null;
};

const normalizeSubject = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();

/** Restituisce la fornitura se l'oggetto è quello di una bolletta Octopus, altrimenti null. */
export function octopusSupplyFromSubject(subject: string): EnergySupply | null {
  const match = normalizeSubject(subject).match(/la tua bolletta octopus energy\s*-\s*(luce|gas)\b/);
  return match ? (match[1] as EnergySupply) : null;
}

const ENTITIES: Record<string, string> = { nbsp: " ", euro: "€", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", zwnj: "", zwj: "", shy: "" };

/** Trasforma l'HTML in righe di testo: ogni cella/riga/blocco va a capo, così etichetta e valore restano vicini. */
export function htmlToLines(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|tr|p|div|li|h[1-6]|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : whole))
    .replace(/[ ​-‍﻿]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function italianNumber(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function isoDate(day: string, month: string, year: string) {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000)) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extract(text: string) {
  const consumption = text.match(/consumo fatturato[\s:]*([\d.,]+)\s*(kwh|smc|mc)\b/i);
  const total = text.match(/totale da pagare[\s:]*([\d.,]+)\s*(?:€|eur)/i) || text.match(/totale\s*\(iva inclusa\)[\s:]*([\d.,]+)\s*(?:€|eur)/i);
  const due = text.match(/scadenza[\s:]*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const period = text.match(/periodo di riferimento:?\s*dal\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*al\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const unit = consumption?.[2];
  return {
    consumption: consumption ? italianNumber(consumption[1]) : null,
    consumptionUnit: unit ? (unit.toLowerCase() === "kwh" ? "kWh" : unit.toLowerCase() === "smc" ? "Smc" : "mc") : null,
    total: total ? italianNumber(total[1]) : null,
    dueDate: due ? isoDate(due[1], due[2], due[3]) : null,
    periodLabel: period ? `${period[1]} - ${period[2]}` : null,
  };
}

/**
 * Legge una bolletta Octopus. Si parte dal testo semplice (etichetta e valore sulla stessa riga);
 * i campi mancanti si recuperano dall'HTML. Restituisce null se l'oggetto non è quello di una bolletta.
 */
export function parseOctopusBill(input: { subject: string; text?: string | null; html?: string | null }): ParsedBill | null {
  const supply = octopusSupplyFromSubject(input.subject || "");
  if (!supply) return null;
  const fromText = extract((input.text || "").replace(/[ ]/g, " "));
  const fromHtml = input.html ? extract(htmlToLines(input.html)) : null;
  const merged = {
    consumption: fromText.consumption ?? fromHtml?.consumption ?? null,
    consumptionUnit: fromText.consumptionUnit ?? fromHtml?.consumptionUnit ?? null,
    total: fromText.total ?? fromHtml?.total ?? null,
    dueDate: fromText.dueDate ?? fromHtml?.dueDate ?? null,
    periodLabel: fromText.periodLabel ?? fromHtml?.periodLabel ?? null,
  };
  const missing = [merged.total === null && "totale", merged.dueDate === null && "scadenza", merged.consumption === null && "consumo"].filter(Boolean);
  return { supply, ...merged, note: missing.length ? `Campi non riconosciuti: ${missing.join(", ")}` : null };
}
