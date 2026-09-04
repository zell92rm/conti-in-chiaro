import { and, eq } from "drizzle-orm";
import { assertSameOrigin, getCurrentUser } from "../../../../../auth";
import { getDb } from "../../../../../../db";
import { accounts, accountOpenBankingLinks, categories, categoryKeywords, transactions } from "../../../../../../db/schema";
import { enableBankingFetch } from "../../../../../../lib/enable-banking-client";

type EnableTransaction = { transaction_amount?: { amount?: unknown; currency?: unknown }; credit_debit_indicator?: unknown; status?: unknown; booking_date?: unknown; value_date?: unknown; transaction_date?: unknown; remittance_information?: unknown; note?: unknown; bank_transaction_code?: { description?: unknown; code?: unknown }; entry_reference?: unknown; transaction_id?: unknown };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

class EnableBankingUpstreamError extends Error {
  constructor(readonly upstreamStatus: number, readonly upstreamCode: string | null, readonly upstreamMessage: string | null) {
    super("Enable Banking ha rifiutato la richiesta");
    this.name = "EnableBankingUpstreamError";
  }
}

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return Response.json({ error: "Origine richiesta non valida" }, { status: 403 }); }
  const accountId = Number((await context.params).accountId);
  const body = await request.json().catch(() => ({})) as { dateFrom?: string; dateTo?: string };
  if (!datePattern.test(body.dateFrom || "") || !datePattern.test(body.dateTo || "") || body.dateFrom! > body.dateTo!) return Response.json({ error: "Periodo non valido" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  if (body.dateFrom! > today) return Response.json({ error: "Il periodo selezionato non è ancora iniziato." }, { status: 400 });
  const dateTo = body.dateTo! < today ? body.dateTo! : today;
  const db = getDb();
  const [account] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, user.email))).limit(1);
  const [link] = await db.select().from(accountOpenBankingLinks).where(and(eq(accountOpenBankingLinks.userId, user.id), eq(accountOpenBankingLinks.accountId, accountId), eq(accountOpenBankingLinks.status, "ENABLED"))).limit(1);
  if (!account || !link) return Response.json({ error: "Il conto non è collegato a Enable Banking." }, { status: 404 });
  try {
    const [remoteTransactions, remoteBalance] = await Promise.all([fetchAllTransactions(user.id, link.accountUid, body.dateFrom!, dateTo), fetchBalance(user.id, link.accountUid)]);
    const [categoryRows, keywordRows, history] = await Promise.all([
      db.select().from(categories).where(eq(categories.ownerEmail, user.email)),
      db.select().from(categoryKeywords).where(eq(categoryKeywords.ownerEmail, user.email)),
      db.select().from(transactions).where(eq(transactions.ownerEmail, user.email)),
    ]);
    const keywords = keywordRows.map(row => ({ keyword: row.keyword.toLowerCase(), category: categoryRows.find(category => category.id === row.categoryId)?.name })).filter(row => row.category);
    const rows: Array<{ date: string; description: string; details?: string; amount: number; category: string; bankStatus: "BOOK"; externalTransactionId?: string }> = [];
    for (const raw of remoteTransactions) {
      const row = normalizeTransaction(raw);
      if (!row || row.date < body.dateFrom! || row.date > dateTo) continue;
      const category = categorize(row.description, row.amount, keywords, history, accountId);
      rows.push({ ...row, category });
    }
    return Response.json({ rows, fetched: remoteTransactions.length, balance: remoteBalance, period: { dateFrom: body.dateFrom, dateTo } });
  } catch (error) {
    if (error instanceof EnableBankingUpstreamError) {
      const code = error.upstreamCode;
      const detail = error.upstreamMessage ? ` Dettaglio Enable Banking: ${error.upstreamMessage}` : "";
      if (code === "EXPIRED_SESSION" || code === "INVALID_SESSION" || error.upstreamStatus === 404) {
        return Response.json({ error: `La sessione Enable Banking non è più valida. Scollega e ricollega il conto.${detail}`, code, apiMessage: error.upstreamMessage }, { status: 409 });
      }
      if (error.upstreamStatus === 401) return Response.json({ error: `Enable Banking ha rifiutato l’autenticazione. Verifica la configurazione e, se necessario, ricollega il conto.${detail}`, code, apiMessage: error.upstreamMessage }, { status: 502 });
      if (error.upstreamStatus === 403) return Response.json({ error: `Enable Banking non consente l’accesso alle transazioni di questo conto.${detail}`, code, apiMessage: error.upstreamMessage }, { status: 502 });
      if (error.upstreamStatus === 429) return Response.json({ error: `Troppe richieste a Enable Banking. Riprova tra poco.${detail}`, code, apiMessage: error.upstreamMessage }, { status: 503 });
      if (error.upstreamStatus === 400 || error.upstreamStatus === 422) return Response.json({ error: `Enable Banking ha rifiutato il periodo o i parametri della sincronizzazione.${detail}`, code, apiMessage: error.upstreamMessage }, { status: 422 });
      return Response.json({ error: `Enable Banking non è disponibile (risposta ${error.upstreamStatus}).${detail}`, code, apiMessage: error.upstreamMessage }, { status: 502 });
    }
    return Response.json({ error: "Sincronizzazione con Enable Banking non riuscita." }, { status: 502 });
  }
}

async function fetchAllTransactions(userId: number, uid: string, dateFrom: string, dateTo: string) {
  const rows: EnableTransaction[] = [];
  const seen = new Set<string>();
  let continuation: string | null = null;
  for (let page = 0; page < 50; page++) {
    const query = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, transaction_status: "BOOK" });
    if (continuation) query.set("continuation_key", continuation);
    const response = await enableBankingFetch(userId, `/accounts/${encodeURIComponent(uid)}/transactions?${query}`);
    if (!response.ok) throw await upstreamError(response);
    const payload = await response.json() as { transactions?: EnableTransaction[]; continuation_key?: string | null };
    if (Array.isArray(payload.transactions)) rows.push(...payload.transactions);
    continuation = typeof payload.continuation_key === "string" && payload.continuation_key ? payload.continuation_key : null;
    if (!continuation) break;
    if (seen.has(continuation)) throw new Error("Paginazione non valida");
    seen.add(continuation);
  }
  if (continuation) throw new Error("Troppe pagine di transazioni contabilizzate");
  return rows;
}
async function upstreamError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
  const code = typeof payload?.error === "string" && /^[A-Z0-9_]{1,80}$/.test(payload.error) ? payload.error : null;
  const message = typeof payload?.message === "string" ? payload.message.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null : null;
  return new EnableBankingUpstreamError(response.status, code, message);
}
async function fetchBalance(userId: number, uid: string) { const response = await enableBankingFetch(userId, `/accounts/${encodeURIComponent(uid)}/balances`); if (!response.ok) return null; const payload = await response.json() as { balances?: Array<{ balance_amount?: { amount?: unknown; currency?: unknown }; balance_type?: unknown }> }; const preferred = payload.balances?.find(item => item.balance_type === "CLAV") || payload.balances?.[0]; const amount = Number(preferred?.balance_amount?.amount); return Number.isFinite(amount) ? { amount, currency: String(preferred?.balance_amount?.currency || "EUR") } : null; }
function normalizeTransaction(raw: EnableTransaction) { const numeric = Number(raw.transaction_amount?.amount); if (!Number.isFinite(numeric) || raw.status === "PDNG") return null; const date = normalizeEnableBankingDate(raw.value_date) || normalizeEnableBankingDate(raw.booking_date); if (!date) return null; const amount = raw.credit_debit_indicator === "DBIT" ? -Math.abs(numeric) : raw.credit_debit_indicator === "CRDT" ? Math.abs(numeric) : numeric; const remittance = Array.isArray(raw.remittance_information) ? raw.remittance_information.map(String).join(" · ") : ""; const note = typeof raw.note === "string" ? raw.note.trim() : ""; const bankDescription = typeof raw.bank_transaction_code?.description === "string" ? raw.bank_transaction_code.description.trim() : ""; const bankCode = typeof raw.bank_transaction_code?.code === "string" ? raw.bank_transaction_code.code.trim() : ""; const reference = typeof raw.entry_reference === "string" ? raw.entry_reference.trim() : ""; const description = remittance || note || bankDescription || bankCode || reference || "Movimento bancario"; const normalizedDescription = cleanEnableBankingDescription(description).slice(0, 500); const details = Array.from(new Set([note, bankDescription, bankCode, reference].map((value) => value.trim()).filter((value) => value && cleanEnableBankingDescription(value) !== normalizedDescription))).join(" · ").slice(0, 2000) || undefined; const externalTransactionId = typeof raw.transaction_id === "string" || typeof raw.transaction_id === "number" ? String(raw.transaction_id).trim().slice(0, 500) || undefined : undefined; return { date, amount, description: normalizedDescription, details, bankStatus: "BOOK" as const, externalTransactionId }; }
function normalizeEnableBankingDate(raw: unknown) { const value = typeof raw === "string" ? raw.trim() : ""; if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10); const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?:\D|$)/); if (!match) return undefined; const year = match[3].length === 2 ? `20${match[3]}` : match[3]; return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function cleanEnableBankingDescription(description: string) { return description.trim().replace(/^(?:pagamento|pagamennto)\b[\s\S]*?\bpresso\b[\s\u00a0]*/i, "").trim().replace(/\s+/g, " ") || "Movimento bancario"; }
function categorize(description: string, amount: number, keywords: Array<{ keyword: string; category: string | undefined }>, history: Array<{ description: string; amount: number; category: string; accountId: number }>, accountId: number) { if (amount > 0) return /rimbor|refund|storno/i.test(description) ? "Rimborso" : "Ricarica"; const normalized = description.toLowerCase(); const keyword = keywords.find(item => normalized.includes(item.keyword)); if (keyword?.category) return keyword.category; const learned = history.filter(item => item.accountId === accountId && item.amount < 0 && item.description.toLowerCase() === normalized).at(-1); return learned?.category || "Altro"; }
