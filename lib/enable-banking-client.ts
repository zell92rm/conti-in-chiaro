import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { userOpenBankingConfig } from "../db/schema";
import { createEnableBankingJwt, decryptPrivateKey } from "./open-banking-crypto";

const PROVIDER = "ENABLE_BANKING";
const API_ORIGIN = "https://api.enablebanking.com";

export class EnableBankingConfigurationError extends Error {
  constructor(message = "Enable Banking non è configurato per questo utente.") {
    super(message);
    this.name = "EnableBankingConfigurationError";
  }
}

/**
 * Executes an authenticated Enable Banking request for a server-authenticated
 * user. This function must only be called from Worker/server code.
 */
export async function enableBankingFetch(userId: number, path: `/${string}`, init: RequestInit = {}): Promise<Response> {
  if (!Number.isInteger(userId) || userId <= 0) throw new EnableBankingConfigurationError();
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Percorso Enable Banking non valido.");

  const [config] = await getDb().select({
    applicationId: userOpenBankingConfig.applicationId,
    encryptedPrivateKey: userOpenBankingConfig.encryptedPrivateKey,
    privateKeyIv: userOpenBankingConfig.privateKeyIv,
  }).from(userOpenBankingConfig).where(and(
    eq(userOpenBankingConfig.userId, userId),
    eq(userOpenBankingConfig.provider, PROVIDER),
  )).limit(1);

  if (!config) throw new EnableBankingConfigurationError();

  let privateKey: Uint8Array | undefined;
  let jwt: string | undefined;
  try {
    privateKey = await decryptPrivateKey(config.encryptedPrivateKey, config.privateKeyIv, userId);
    jwt = await createEnableBankingJwt(config.applicationId, privateKey, 3600);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${jwt}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return await fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  } finally {
    privateKey?.fill(0);
    jwt = undefined;
  }
}
