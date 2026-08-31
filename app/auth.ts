import { and, eq, gt, lte } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { loginAttempts, sessions, users } from "../db/schema";

export type AppUser = { id: number; displayName: string; email: string };

const COOKIE_NAME = "conti_session";
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 rounds.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_DAYS = 30;

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const sessionId = await sha256(token);
  const [row] = await getDb()
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1);
  return row ?? null;
}

export async function requireUser(returnTo = "/"): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export async function hasRegisteredUser(): Promise<boolean> {
  const row = await getDb().select({ id: users.id }).from(users).limit(1);
  return row.length > 0;
}

export async function registerFirstUser(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AppUser> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  validateCredentials(displayName, email, input.password);
  const { hash, salt } = await hashPassword(input.password);
  const [user] = await getDb().insert(users).values({
    singleton: 1,
    email,
    displayName,
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    createdAt: new Date().toISOString(),
  }).returning({ id: users.id, displayName: users.displayName, email: users.email });
  return user;
}

export async function authenticate(emailInput: string, password: string, request: Request): Promise<AppUser | null> {
  const email = normalizeEmail(emailInput);
  const attemptKey = await sha256(`${email}|${request.headers.get("cf-connecting-ip") || "unknown"}`);
  const [attempt] = await getDb().select().from(loginAttempts).where(eq(loginAttempts.key, attemptKey)).limit(1);
  if (attempt?.blockedUntil && attempt.blockedUntil > new Date().toISOString()) {
    throw new Error("Troppi tentativi. Riprova tra 15 minuti.");
  }
  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  const valid = user
    ? await verifyPassword(password, user.passwordSalt, user.passwordHash, user.passwordIterations)
    : await consumePasswordCheck(password);
  if (!valid || !user) {
    const failures = (attempt?.failures ?? 0) + 1;
    const blockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await getDb().insert(loginAttempts).values({ key: attemptKey, failures, blockedUntil, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: loginAttempts.key, set: { failures, blockedUntil, updatedAt: new Date().toISOString() } });
    return null;
  }
  await getDb().delete(loginAttempts).where(eq(loginAttempts.key, attemptKey));
  return { id: user.id, displayName: user.displayName, email: user.email };
}

export async function createSession(userId: number): Promise<string> {
  const token = randomToken(32);
  const now = new Date();
  await getDb().delete(sessions).where(lte(sessions.expiresAt, now.toISOString()));
  await getDb().insert(sessions).values({
    id: await sha256(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
  });
  return token;
}

export async function deleteCurrentSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, await sha256(token)));
}

export function sessionCookie(token: string, secure = true): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie(secure = true): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  let originUrl: URL;
  try { originUrl = new URL(origin); }
  catch { throw new Error("Origine richiesta non valida."); }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host") || request.headers.get(":authority");
  const proxyOrigin = forwardedHost && (forwardedProto === "http" || forwardedProto === "https")
    ? `${forwardedProto}://${forwardedHost}`
    : null;
  if (origin === requestUrl.origin || origin === proxyOrigin) return;
  const localHostname = isLocalHostname(originUrl.hostname);
  const sameExternalHost = !!requestHost && originUrl.host === requestHost;
  const browserConfirmedSameOrigin = request.headers.get("sec-fetch-site") === "same-origin";
  const localTlsProxy = localHostname && originUrl.protocol === "https:" && (sameExternalHost || browserConfirmedSameOrigin);
  if (!localTlsProxy) throw new Error("Origine richiesta non valida.");
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname.endsWith(".local") || hostname === "pcs5.reply";
}

export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  return value.startsWith("/login") || value.startsWith("/register") ? "/" : value;
}

function validateCredentials(displayName: string, email: string, password: string): void {
  if (displayName.length < 2 || displayName.length > 80) throw new Error("Inserisci un nome valido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Inserisci un’email valida.");
  if (password.length < 12 || password.length > 128) throw new Error("La password deve contenere almeno 12 caratteri.");
}

function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function randomToken(bytes: number): string { const value = crypto.getRandomValues(new Uint8Array(bytes)); return base64(value); }
async function sha256(value: string): Promise<string> { return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivePassword(password, saltBytes, PASSWORD_ITERATIONS), salt: base64(saltBytes) };
}
async function verifyPassword(password: string, salt: string, expected: string, iterations: number): Promise<boolean> {
  const actual = await derivePassword(password, fromBase64(salt), iterations);
  const a = new TextEncoder().encode(actual), b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0; for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
async function consumePasswordCheck(password: string): Promise<false> {
  await derivePassword(password, new Uint8Array(16), PASSWORD_ITERATIONS);
  return false;
}
async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PASSWORD_ITERATIONS) {
    throw new Error("Configurazione password non compatibile con Cloudflare Workers.");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return base64(new Uint8Array(bits));
}
function base64(value: Uint8Array): string { return btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64(value: string): Uint8Array { const normalized = value.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0)); }
