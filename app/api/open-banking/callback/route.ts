import { and, eq, gt } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accountOpenBankingLinks, openBankingAuthorizations } from "../../../../db/schema";
import { enableBankingFetch } from "../../../../lib/enable-banking-client";

const PROVIDER = "ENABLE_BANKING";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const source = new URL(request.url);
  if (!user) return Response.redirect(new URL("/login?return_to=/configurazione", source.origin), 303);
  const state = source.searchParams.get("state");
  const code = source.searchParams.get("code");
  const stateHash = state ? await sha256(state) : "";
  const [authorization] = await getDb().select().from(openBankingAuthorizations).where(and(eq(openBankingAuthorizations.userId, user.id), eq(openBankingAuthorizations.stateHash, stateHash), eq(openBankingAuthorizations.status, "PENDING"), gt(openBankingAuthorizations.expiresAt, new Date().toISOString()))).limit(1);
  const destination = new URL(authorization ? `/configurazione/conti/${authorization.accountId}` : "/configurazione", source.origin);
  if (!authorization || source.searchParams.get("error") || !code || code.length > 4096) {
    if (authorization) await getDb().update(openBankingAuthorizations).set({ status: "ERROR", updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
    destination.searchParams.set("open_banking", authorization ? "authorization_error" : "invalid_callback");
    return Response.redirect(destination, 303);
  }
  try {
    await getDb().update(openBankingAuthorizations).set({ status: "EXCHANGING", updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
    const response = await enableBankingFetch(user.id, "/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const session = await response.json().catch(() => ({})) as { session_id?: string; accounts?: unknown[]; accounts_data?: unknown[]; error?: unknown; message?: unknown };
    const hasAccounts = (Array.isArray(session.accounts_data) && session.accounts_data.length > 0) || (Array.isArray(session.accounts) && session.accounts.length > 0);
    if (!response.ok || !session.session_id || !hasAccounts) throw new Error("Sessione non valida");
    await getDb().update(openBankingAuthorizations).set({ sessionId: session.session_id, updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
    const accountValues = Array.isArray(session.accounts_data) && session.accounts_data.length ? session.accounts_data : session.accounts ?? [];
    const candidates = accountValues.map(candidateFromAccount).filter((item): item is { uid: string; label: string } => !!item);
    if (!candidates.length) throw new Error("Nessun conto autorizzato");
    if (candidates.length === 1) {
      await saveLink(user.id, authorization.accountId, session.session_id, candidates[0].uid, authorization.bankName, authorization.bankCountry);
      await getDb().update(openBankingAuthorizations).set({ sessionId: session.session_id, authorizedAccounts: null, status: "COMPLETED", updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
      destination.searchParams.set("open_banking", "linked");
    } else {
      await getDb().update(openBankingAuthorizations).set({ sessionId: session.session_id, authorizedAccounts: JSON.stringify(candidates), status: "AWAITING_ACCOUNT", updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
      destination.searchParams.set("open_banking", "choose_account");
    }
  } catch {
    await getDb().update(openBankingAuthorizations).set({ status: "ERROR", updatedAt: new Date().toISOString() }).where(eq(openBankingAuthorizations.id, authorization.id));
    destination.searchParams.set("open_banking", "session_error");
  }
  return Response.redirect(destination, 303);
}

function candidateFromAccount(value: unknown) {
  if (typeof value === "string" && value) return { uid: value, label: `Conto bancario · ${value.slice(0, 8)}…` };
  const account = value as { uid?: unknown; name?: unknown; account_id?: { iban?: unknown; identification?: unknown } };
  if (typeof account?.uid !== "string") return null;
  const identifier = typeof account.account_id?.iban === "string" ? maskIban(account.account_id.iban) : typeof account.account_id?.identification === "string" ? account.account_id.identification.slice(-8) : account.uid.slice(0, 8);
  return { uid: account.uid, label: `${typeof account.name === "string" ? account.name : "Conto bancario"} · ${identifier}` };
}
function maskIban(value: string) { return value.length > 8 ? `${value.slice(0, 4)}••••${value.slice(-4)}` : value; }
async function sha256(value: string) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return btoa(String.fromCharCode(...bytes)); }
async function saveLink(userId: number, accountId: number, sessionId: string, accountUid: string, bankName: string, bankCountry: string) { const timestamp = new Date().toISOString(); await getDb().insert(accountOpenBankingLinks).values({ userId, accountId, provider: PROVIDER, sessionId, accountUid, bankName, bankCountry, status: "ENABLED", createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: [accountOpenBankingLinks.accountId, accountOpenBankingLinks.provider], set: { userId, sessionId, accountUid, bankName, bankCountry, status: "ENABLED", updatedAt: timestamp } }); }
