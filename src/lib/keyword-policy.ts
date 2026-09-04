export type KeywordScope = "category" | "fixed_expense";

export const normalizeKeyword = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const normalizeKeywords = (values: unknown) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map(normalizeKeyword).filter(Boolean),
));

export const automaticKeywordStopWords = new Set([
  "pagamento", "pagamennto", "carta", "carte", "pos", "presso", "operazione", "movimento", "transazione", "addebito", "accredito",
  "bonifico", "sepa", "mandato", "commissione", "conto", "banca", "data", "valuta", "riferimento", "rif", "numero", "euro", "eur",
  "con", "per", "del", "della", "delle", "degli", "dei", "dal", "alla", "alle", "nel", "nella", "nelle", "sul", "sulla", "una", "uno",
  "the", "and", "from", "payment", "card", "transaction", "spa", "srl", "italia", "italy",
  "roma", "milano", "napoli", "torino", "firenze", "bologna", "genova", "palermo", "venezia", "verona", "padova", "trieste",
  "via", "viale", "piazza", "corso", "largo", "strada", "localita", "provincia",
]);
