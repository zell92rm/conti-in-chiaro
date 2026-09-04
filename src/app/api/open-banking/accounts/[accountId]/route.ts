import { and, desc, eq, gt } from "drizzle-orm";
import { assertSameOrigin, getCurrentUser } from "../../../../auth";
import { getDb } from "../../../../../db";
import { accounts, accountOpenBankingLinks, openBankingAuthorizations } from "../../../../../db/schema";
import { enableBankingFetch } from "../../../../../lib/enable-banking-client";
import { ENABLE_BANKING_REDIRECT_URL } from "../../../../../lib/open-banking-urls";

const PROVIDER = "ENABLE_BANKING";
const now = () => new Date().toISOString();

export async function GET(_: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const accountId = Number((await context.params).accountId);
  if (!await ownsAccount(accountId, user.email)) return Response.json({ error: "Conto non trovato" }, { status: 404 });
  const [link] = await getDb().select({ bankName: accountOpenBankingLinks.bankName, bankCountry: accountOpenBankingLinks.bankCountry, accountUid: accountOpenBankingLinks.accountUid, status: accountOpenBankingLinks.status, updatedAt: accountOpenBankingLinks.updatedAt }).from(accountOpenBankingLinks).where(and(eq(accountOpenBankingLinks.userId, user.id), eq(accountOpenBankingLinks.accountId, accountId), eq(accountOpenBankingLinks.provider, PROVIDER))).limit(1);
  const [pending] = await getDb().select({ id: openBankingAuthorizations.id, bankName: openBankingAuthorizations.bankName, sessionId: openBankingAuthorizations.sessionId, authorizedAccounts: openBankingAuthorizations.authorizedAccounts, status: openBankingAuthorizations.status }).from(openBankingAuthorizations).where(and(eq(openBankingAuthorizations.userId, user.id), eq(openBankingAuthorizations.accountId, accountId), eq(openBankingAuthorizations.status, "AWAITING_ACCOUNT"), gt(openBankingAuthorizations.expiresAt, now()))).orderBy(desc(openBankingAuthorizations.id)).limit(1);
  return Response.json({ enabled: !!link, link: link || null, pending: pending ? { authorizationId: pending.id, bankName: pending.bankName, accounts: parseCandidates(pending.authorizedAccounts) } : null });
}

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return Response.json({ error: "Origine richiesta non valida" }, { status: 403 }); }
  const accountId = Number((await context.params).accountId);
  if (!await ownsAccount(accountId, user.email)) return Response.json({ error: "Conto non trovato" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: string; bankName?: string; psuType?: string; authorizationId?: number; accountUid?: string };
  if (body.action === "select-account") return selectAccount(user.id, accountId, body.authorizationId, body.accountUid);
  if (body.action !== "authorize") return Response.json({ error: "Operazione non valida" }, { status: 400 });
  const psuType = body.psuType === "business" ? "business" : "personal";
  const redirectUrl = callbackUrlForRequest(request);
  try {
    const listResponse = await enableBankingFetch(user.id, "/aspsps?country=IT&service=AIS");
    if (!listResponse.ok) throw new Error();
    const list = await listResponse.json() as { aspsps?: Array<{ name: string; country: string; psu_types?: string[]; maximum_consent_validity?: number }> };
    const bank = (list.aspsps || []).find(item => item.country === "IT" && item.name === body.bankName && item.psu_types?.includes(psuType));
    if (!bank) return Response.json({ error: "Banca o tipologia utente non disponibile." }, { status: 400 });
    const state = randomState();
    const stateHash = await sha256(state);
    const createdAt = now();
    const maximum = Math.max(3600, Math.min(Number(bank.maximum_consent_validity) || 86400, 365 * 86400));
    const validUntil = new Date(Date.now() + maximum * 1000 - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const [authorization] = await getDb().insert(openBankingAuthorizations).values({ userId: user.id, accountId, stateHash, bankName: bank.name, bankCountry: bank.country, psuType, status: "PENDING", expiresAt, createdAt, updatedAt: createdAt }).returning({ id: openBankingAuthorizations.id });
    const response = await enableBankingFetch(user.id, "/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access: { balances: true, transactions: true, valid_until: validUntil }, aspsp: { name: bank.name, country: bank.country }, state, redirect_url: redirectUrl, psu_type: psuType, language: "it" }) });
    const payload = await response.json().catch(() => ({})) as { url?: string; authorization_id?: string };
    if (!response.ok || !payload.url || !payload.authorization_id) { await getDb().delete(openBankingAuthorizations).where(eq(openBankingAuthorizations.id, authorization.id)); return Response.json({ error: "Enable Banking non ha avviato l’autorizzazione." }, { status: 502 }); }
    const redirect = new URL(payload.url);
    if (redirect.protocol !== "https:" || !(redirect.hostname === "enablebanking.com" || redirect.hostname.endsWith(".enablebanking.com"))) throw new Error("URL di autorizzazione non valido");
    await getDb().update(openBankingAuthorizations).set({ authorizationId: payload.authorization_id, updatedAt: now() }).where(eq(openBankingAuthorizations.id, authorization.id));
    return Response.json({ url: redirect.toString() });
  } catch { return Response.json({ error: "Impossibile avviare il collegamento bancario." }, { status: 502 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ accountId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try { assertSameOrigin(request); } catch { return Response.json({ error: "Origine richiesta non valida" }, { status: 403 }); }
  const accountId = Number((await context.params).accountId);
  if (!await ownsAccount(accountId, user.email)) return Response.json({ error: "Conto non trovato" }, { status: 404 });
  await getDb().delete(accountOpenBankingLinks).where(and(eq(accountOpenBankingLinks.userId, user.id), eq(accountOpenBankingLinks.accountId, accountId)));
  return Response.json({ ok: true });
}

async function selectAccount(userId: number, accountId: number, authorizationId: unknown, accountUid: unknown) {
  const [authorization] = await getDb().select().from(openBankingAuthorizations).where(and(eq(openBankingAuthorizations.id, Number(authorizationId)), eq(openBankingAuthorizations.userId, userId), eq(openBankingAuthorizations.accountId, accountId), eq(openBankingAuthorizations.status, "AWAITING_ACCOUNT"), gt(openBankingAuthorizations.expiresAt, now()))).limit(1);
  const candidates = parseCandidates(authorization?.authorizedAccounts);
  const selected = candidates.find(item => item.uid === accountUid);
  if (!authorization?.sessionId || !selected) return Response.json({ error: "Conto autorizzato non valido o scaduto." }, { status: 400 });
  await saveLink(userId, accountId, authorization.sessionId, selected.uid, authorization.bankName, authorization.bankCountry);
  await getDb().update(openBankingAuthorizations).set({ status: "COMPLETED", updatedAt: now(), authorizedAccounts: null }).where(eq(openBankingAuthorizations.id, authorization.id));
  return Response.json({ ok: true });
}

async function ownsAccount(accountId: number, email: string) { if (!Number.isInteger(accountId) || accountId < 1) return false; return !!(await getDb().select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, email))).limit(1))[0]; }
function randomState() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function callbackUrlForRequest(request: Request) { const origin = request.headers.get("origin"); if (!origin) return ENABLE_BANKING_REDIRECT_URL; try { const url = new URL(origin); if (url.protocol !== "https:") return ENABLE_BANKING_REDIRECT_URL; return new URL("/api/open-banking/callback", url).toString(); } catch { return ENABLE_BANKING_REDIRECT_URL; } }
async function sha256(value: string) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return btoa(String.fromCharCode(...bytes)); }
type Candidate = { uid: string; label: string };
function parseCandidates(value: string | null | undefined): Candidate[] { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter(item => typeof item?.uid === "string" && typeof item?.label === "string") : []; } catch { return []; } }
async function saveLink(userId: number, accountId: number, sessionId: string, accountUid: string, bankName: string, bankCountry: string) { const timestamp = now(); await getDb().insert(accountOpenBankingLinks).values({ userId, accountId, provider: PROVIDER, sessionId, accountUid, bankName, bankCountry, status: "ENABLED", createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: [accountOpenBankingLinks.accountId, accountOpenBankingLinks.provider], set: { userId, sessionId, accountUid, bankName, bankCountry, status: "ENABLED", updatedAt: timestamp } }); }
