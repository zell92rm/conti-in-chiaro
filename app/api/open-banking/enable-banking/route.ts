import { and, eq } from "drizzle-orm";
import { assertSameOrigin, getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accountOpenBankingLinks, openBankingAuthorizations, userOpenBankingConfig } from "../../../../db/schema";
import { encryptPrivateKey, validatePemBytes } from "../../../../lib/open-banking-crypto";
import { enableBankingFetch } from "../../../../lib/enable-banking-client";

const PROVIDER = "ENABLE_BANKING";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicFields = { applicationId: userOpenBankingConfig.applicationId, status: userOpenBankingConfig.status, updatedAt: userOpenBankingConfig.updatedAt };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const [config] = await getDb().select(publicFields).from(userOpenBankingConfig).where(and(eq(userOpenBankingConfig.userId, user.id), eq(userOpenBankingConfig.provider, PROVIDER))).limit(1);
  return Response.json(config ? { configured: true, ...config, privateKeyConfigured: true } : { configured: false, status: "NOT_CONFIGURED", privateKeyConfigured: false });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try { assertSameOrigin(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Richiesta non valida" }, { status: 403 }); }
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) return save(request, user.id);
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== "verify") return Response.json({ error: "Operazione non valida" }, { status: 400 });
  const [config] = await getDb().select().from(userOpenBankingConfig).where(and(eq(userOpenBankingConfig.userId, user.id), eq(userOpenBankingConfig.provider, PROVIDER))).limit(1);
  if (!config) return Response.json({ error: "Configurazione non presente" }, { status: 404 });
  try {
    const response = await enableBankingFetch(user.id, "/application");
    const status = response.ok ? "VALID" : "ERROR";
    await getDb().update(userOpenBankingConfig).set({ status, updatedAt: new Date().toISOString() }).where(eq(userOpenBankingConfig.id, config.id));
    if (!response.ok) return Response.json({ error: "Enable Banking ha rifiutato le credenziali.", status }, { status: 422 });
    return Response.json({ ok: true, status });
  } catch {
    await getDb().update(userOpenBankingConfig).set({ status: "ERROR", updatedAt: new Date().toISOString() }).where(eq(userOpenBankingConfig.id, config.id));
    return Response.json({ error: "Impossibile verificare la configurazione.", status: "ERROR" }, { status: 422 });
  }
}

async function save(request: Request, userId: number) {
  const [existing] = await getDb().select({ id: userOpenBankingConfig.id }).from(userOpenBankingConfig).where(and(eq(userOpenBankingConfig.userId, userId), eq(userOpenBankingConfig.provider, PROVIDER))).limit(1);
  if (existing) return Response.json({ error: "Enable Banking è già configurato. Disabilitalo prima di caricare nuove credenziali." }, { status: 409 });
  const form = await request.formData();
  const applicationId = String(form.get("applicationId") || "").trim();
  const file = form.get("privateKey");
  if (!uuid.test(applicationId)) return Response.json({ error: "Application ID non valido." }, { status: 400 });
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pem")) return Response.json({ error: "Seleziona un file .pem." }, { status: 400 });
  let privateKey: Uint8Array | undefined;
  try {
    privateKey = new Uint8Array(await file.arrayBuffer());
    await validatePemBytes(privateKey);
    const encrypted = await encryptPrivateKey(privateKey, userId);
    const now = new Date().toISOString();
    try {
      await getDb().insert(userOpenBankingConfig).values({ userId, provider: PROVIDER, applicationId, encryptedPrivateKey: encrypted.encrypted, privateKeyIv: encrypted.iv, status: "CONFIGURED", createdAt: now, updatedAt: now });
    } catch {
      return Response.json({ error: "Enable Banking è già configurato. Disabilitalo prima di caricare nuove credenziali." }, { status: 409 });
    }
    return Response.json({ configured: true, applicationId, privateKeyConfigured: true, status: "CONFIGURED", updatedAt: now });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Impossibile salvare la configurazione." }, { status: 400 }); }
  finally { privateKey?.fill(0); }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  try { assertSameOrigin(request); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Richiesta non valida" }, { status: 403 }); }
  await getDb().delete(accountOpenBankingLinks).where(eq(accountOpenBankingLinks.userId, user.id));
  await getDb().delete(openBankingAuthorizations).where(eq(openBankingAuthorizations.userId, user.id));
  await getDb().delete(userOpenBankingConfig).where(and(eq(userOpenBankingConfig.userId, user.id), eq(userOpenBankingConfig.provider, PROVIDER)));
  return Response.json({ ok: true, status: "NOT_CONFIGURED" });
}
