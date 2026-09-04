import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
const PROVIDER = "ENABLE_BANKING";

function base64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), character => character.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = (env as unknown as { OPEN_BANKING_ENCRYPTION_KEY?: string }).OPEN_BANKING_ENCRYPTION_KEY;
  if (!secret) throw new Error("Secret OPEN_BANKING_ENCRYPTION_KEY non configurato.");
  let raw: Uint8Array;
  try { raw = fromBase64(secret.trim()); } catch { throw new Error("OPEN_BANKING_ENCRYPTION_KEY deve essere una chiave Base64 di 32 byte."); }
  if (raw.byteLength !== 32) throw new Error("OPEN_BANKING_ENCRYPTION_KEY deve decodificare esattamente 32 byte.");
  try { return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); }
  finally { raw.fill(0); }
}

function pkcs8DerFromPem(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 256 || bytes.byteLength > 32_768) throw new Error("La private key PEM non ha una dimensione valida.");
  const pem = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").trim();
  const match = pem.match(/^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+?)\s+-----END PRIVATE KEY-----$/);
  if (!match) throw new Error("Carica una private key PEM PKCS#8 valida (BEGIN PRIVATE KEY).");
  const encoded = match[1].replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error("Il contenuto Base64 della private key PEM non è valido.");
  try { return fromBase64(encoded); }
  catch { throw new Error("Il contenuto Base64 della private key PEM non è valido."); }
}

export async function validatePemBytes(bytes: Uint8Array): Promise<void> {
  const der = pkcs8DerFromPem(bytes);
  try {
    await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch {
    throw new Error("Il file è un PEM PKCS#8, ma non contiene una private key RSA valida.");
  } finally {
    der.fill(0);
  }
}

export async function encryptPrivateKey(bytes: Uint8Array, userId: number): Promise<{ encrypted: string; iv: string }> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${userId}:${PROVIDER}`) }, key, bytes);
  return { encrypted: base64(new Uint8Array(encrypted)), iv: base64(iv) };
}

export async function decryptPrivateKey(encrypted: string, iv: string, userId: number): Promise<Uint8Array> {
  const key = await encryptionKey();
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(`${userId}:${PROVIDER}`) }, key, fromBase64(encrypted)));
}

export async function createEnableBankingJwt(applicationId: string, pemBytes: Uint8Array, ttlSeconds = 3600): Promise<string> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) throw new Error("Durata JWT Enable Banking non valida.");
  const der = pkcs8DerFromPem(pemBytes);
  try {
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const now = Math.floor(Date.now() / 1000);
    const encodeJson = (value: unknown) => base64(encoder.encode(JSON.stringify(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const unsigned = `${encodeJson({ typ: "JWT", alg: "RS256", kid: applicationId })}.${encodeJson({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + ttlSeconds })}`;
    const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned)));
    return `${unsigned}.${base64(signature).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  } finally { der.fill(0); }
}
