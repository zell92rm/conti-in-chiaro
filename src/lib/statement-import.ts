// Lettura degli estratti conto: parser di basso livello (CSV / XLSX) e profili per banca.
import { getBank, type BankId } from "./banks";

export type ParsedRow = { date: string; description: string; details?: string; amount: number };

const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Trova la riga di intestazione che contiene tutte le colonne richieste (match esatto sul nome normalizzato). */
function locateColumns(data: string[][], required: Record<string, string[]>, optional: Record<string, string[]> = {}) {
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const headers = data[rowIndex].map(norm);
    const pick = (names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
    const columns: Record<string, number> = {};
    let complete = true;
    for (const [key, names] of Object.entries(required)) { columns[key] = pick(names); if (columns[key] < 0) complete = false; }
    if (!complete) continue;
    for (const [key, names] of Object.entries(optional)) columns[key] = pick(names);
    return { rowIndex, columns };
  }
  return null;
}

type Profile = (data: string[][]) => ParsedRow[];

const finish = (rows: ParsedRow[]) => rows.filter((row) => row.date && row.description && Number.isFinite(row.amount) && row.amount !== 0);

// Intesa Sanpaolo (XLSX): righe di preambolo, poi Data | Operazione | Dettagli | … | Importo (data come seriale Excel).
const intesa: Profile = (data) => {
  const found = locateColumns(data, { date: ["data"], description: ["operazione"], amount: ["importo"] }, { details: ["dettagli"] });
  if (!found) throw new Error("Estratto Intesa Sanpaolo non riconosciuto: servono le colonne Data, Operazione e Importo");
  const { rowIndex, columns: c } = found;
  return finish(data.slice(rowIndex + 1).map((r) => ({
    date: normalizeImportDate(r[c.date]),
    description: String(r[c.description] || "Movimento").trim(),
    details: c.details >= 0 ? String(r[c.details] || "").trim() || undefined : undefined,
    amount: money(r[c.amount]),
  })));
};

// Hype (CSV): Data operazione, Data contabile, Iban, Tipologia, Nome, Descrizione, "Importo ( € )" – date gg/mm/aaaa.
const hype: Profile = (data) => {
  const found = locateColumns(data, { date: ["data operazione"], description: ["descrizione"], amount: ["importo ( € )", "importo (€)", "importo"] });
  if (!found) throw new Error("Estratto Hype non riconosciuto: servono le colonne Data operazione, Descrizione e Importo ( € )");
  const { rowIndex, columns: c } = found;
  return finish(data.slice(rowIndex + 1).map((r) => ({
    date: normalizeImportDate(r[c.date]),
    description: String(r[c.description] || "Movimento").trim(),
    amount: money(r[c.amount]),
  })));
};

// Revolut (CSV): Tipo, Prodotto, Data di inizio, Data di completamento, Descrizione, Importo, Costo, Valuta, State, Saldo.
// Si importano solo i movimenti COMPLETATI in EUR; il saldo varia di Importo − Costo, quindi la commissione viene detratta.
const revolut: Profile = (data) => {
  const found = locateColumns(data, { date: ["data di inizio"], description: ["descrizione"], amount: ["importo"] }, { fee: ["costo"], currency: ["valuta"], state: ["state", "stato"] });
  if (!found) throw new Error("Estratto Revolut non riconosciuto: servono le colonne Data di inizio, Descrizione e Importo");
  const { rowIndex, columns: c } = found;
  return finish(data.slice(rowIndex + 1)
    .filter((r) => (c.state < 0 || norm(r[c.state]) === "completato") && (c.currency < 0 || !r[c.currency] || norm(r[c.currency]) === "eur"))
    .map((r) => {
      const fee = c.fee >= 0 && r[c.fee] ? money(r[c.fee]) : 0;
      return {
        date: normalizeImportDate(r[c.date]),
        description: String(r[c.description] || "Movimento").trim(),
        amount: Math.round((money(r[c.amount]) - (Number.isFinite(fee) ? fee : 0)) * 100) / 100,
      };
    }));
};

// Conti senza banca impostata: riconoscimento generico delle intestazioni (comportamento storico).
function generic(data: string[][], fileType: "csv" | "xlsx"): ParsedRow[] {
  if (data.length < 2) throw new Error("Il file non contiene movimenti");
  const headerIndex = data.findIndex((row) => {
    const headers = row.map(norm);
    const hasDate = headers.some((header) => header === "data" || header === "date" || header.startsWith("data "));
    const hasDescription = headers.some((header) => ["descrizione", "description", "operazione"].includes(header));
    const hasAmount = headers.some((header) => ["importo", "amount", "valore", "uscite", "addebiti", "entrate", "accrediti"].some((name) => header.includes(name)));
    return hasDate && hasDescription && hasAmount;
  });
  if (headerIndex < 0) throw new Error("Non è stata trovata una riga di intestazione valida");
  const h = data[headerIndex].map(norm);
  const find = (words: string[]) => h.findIndex((x) => words.some((w) => x.includes(w)));
  const exact = (names: string[]) => names.map((name) => h.findIndex((header) => header === name)).find((index) => index >= 0) ?? -1;
  const di = find(["data", "date"]),
    xi = exact(fileType === "xlsx" ? ["operazione", "descrizione", "description"] : ["descrizione", "description", "operazione"]),
    detailsIndex = exact(["dettagli", "details"]),
    ai = find(["importo", "amount", "valore"]), ui = find(["uscite", "addebiti"]), ei = find(["entrate", "accrediti"]);
  if (di < 0 || xi < 0 || (ai < 0 && ui < 0 && ei < 0))
    throw new Error(fileType === "xlsx" ? "Servono le colonne Data, Operazione e Importo" : "Servono colonne Data, Descrizione e Importo (oppure Entrate/Uscite)");
  return finish(data.slice(headerIndex + 1).map((r) => ({
    date: normalizeImportDate(r[di]),
    description: String(r[xi] || "Movimento").trim(),
    details: detailsIndex >= 0 ? String(r[detailsIndex] || "").trim() || undefined : undefined,
    amount: money(ai >= 0 ? r[ai] : r[ei] || "" || `-${r[ui] || ""}`),
  })));
}

const PROFILES: Record<BankId, Profile> = { intesa, hype, revolut };

/** Formati accettati dal selettore file per il conto (senza banca: entrambi). */
export function statementAccept(bank?: string | null) {
  const profile = getBank(bank);
  return profile ? `.${profile.fileType}` : ".csv,.xlsx";
}
export function statementHint(bank?: string | null) {
  const profile = getBank(bank);
  return profile ? `${profile.label}: file ${profile.fileType.toUpperCase()}` : "CSV o XLSX, prima riga con intestazioni";
}

/** Legge un estratto conto usando il formato della banca del conto (o il riconoscimento generico se assente). */
export async function parseStatement(file: File, bank?: string | null): Promise<ParsedRow[]> {
  const fileType = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
  const profile = getBank(bank);
  if (profile && profile.fileType !== fileType)
    throw new Error(`Per un conto ${profile.label} serve un file ${profile.fileType.toUpperCase()}, non ${fileType.toUpperCase()}`);
  const data = fileType === "xlsx" ? await parseXlsx(file) : parseDelimited(await file.text());
  return profile ? PROFILES[profile.id](data) : generic(data, fileType);
}

export function parseDelimited(text: string) {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"') {
      if (quoted && clean[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === sep && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function money(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,(?=\d{3}\b)/g, "");
  return Number(normalized.replace(/[^0-9.-]/g, ""));
}
export function normalizeImportDate(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 0 && serial < 100000) {
      const timestamp = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
      return new Date(timestamp).toISOString().slice(0, 10);
    }
  }
  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?:\D|$)/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
export async function parseXlsx(file: File) {
  const b = new Uint8Array(await file.arrayBuffer()),
    files: Record<string, Uint8Array> = {};
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let endOfCentralDirectory = -1;
  for (let offset = b.length - 22; offset >= Math.max(0, b.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error("Il file Excel non contiene un archivio ZIP valido");
  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  let centralOffset = view.getUint32(endOfCentralDirectory + 16, true);
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("Indice ZIP Excel non valido");
    const method = view.getUint16(centralOffset + 10, true),
      compressedSize = view.getUint32(centralOffset + 20, true),
      nameLength = view.getUint16(centralOffset + 28, true),
      extraLength = view.getUint16(centralOffset + 30, true),
      commentLength = view.getUint16(centralOffset + 32, true),
      localOffset = view.getUint32(centralOffset + 42, true),
      name = new TextDecoder().decode(b.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Contenuto ZIP Excel non valido");
    const localNameLength = view.getUint16(localOffset + 26, true),
      localExtraLength = view.getUint16(localOffset + 28, true),
      dataOffset = localOffset + 30 + localNameLength + localExtraLength,
      raw = b.slice(dataOffset, dataOffset + compressedSize);
    if (method === 0) files[name] = raw;
    else if (method === 8) {
      const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
      files[name] = new Uint8Array(
        await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer(),
      );
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  const dec = (n: string) =>
    files[n] ? new TextDecoder().decode(files[n]) : "";
  const shared = [
    ...dec("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((x) => xml(x[1]))
      .join(""),
  );
  const sheet = dec("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Il primo foglio Excel non è leggibile");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const out: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = c[1].match(/\br="([A-Z]+)\d+"/),
        type = c[1].match(/\bt="([^"]+)"/)?.[1];
      if (!reference) continue;
      const idx = reference[1].split("").reduce((s, x) => s * 26 + x.charCodeAt(0) - 64, 0) - 1,
        v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/))?.[1] || "";
      out[idx] = type === "s" ? shared[Number(v)] || "" : xml(v);
    }
    return out;
  });
}
function xml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
