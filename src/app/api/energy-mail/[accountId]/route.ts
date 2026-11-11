import { and, desc, eq } from "drizzle-orm";
import { assertSameOrigin, getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts, energyBills, energyMailConfigs } from "../../../../db/schema";
import { GMAIL_ONLY_MESSAGE, getEnergyProvider, isGmailAddress } from "../../../../lib/energy-providers";
import { normalizeTimes } from "../../../../lib/mail-schedule";
import { applyPendingBills, passwordContext } from "../../../../lib/mail-sync";
import { encryptSecret } from "../../../../lib/open-banking-crypto";

const now = () => new Date().toISOString();
type Context = { params: Promise<{ accountId: string }> };

async function ownAccount(accountId: number, ownerEmail: string) {
  if (!Number.isInteger(accountId)) return null;
  const [account] = await getDb().select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, ownerEmail))).limit(1);
  return account && ["personale", "spese_mese"].includes(account.type) ? account : null;
}

async function status(accountId: number, ownerEmail: string) {
  const db = getDb();
  const [config] = await db.select().from(energyMailConfigs).where(and(eq(energyMailConfigs.accountId, accountId), eq(energyMailConfigs.ownerEmail, ownerEmail))).limit(1);
  const bills = await db.select({
    id: energyBills.id, supply: energyBills.supply, consumption: energyBills.consumption, consumptionUnit: energyBills.consumptionUnit, total: energyBills.total,
    dueDate: energyBills.dueDate, periodLabel: energyBills.periodLabel, appliedAt: energyBills.appliedAt, appliedMonth: energyBills.appliedMonth, note: energyBills.note, receivedAt: energyBills.receivedAt,
  }).from(energyBills).where(and(eq(energyBills.accountId, accountId), eq(energyBills.ownerEmail, ownerEmail))).orderBy(desc(energyBills.dueDate), desc(energyBills.id)).limit(24);
  let summary: unknown = null;
  try { summary = config?.lastSummary ? JSON.parse(config.lastSummary) : null; } catch { summary = null; }
  return {
    config: config ? {
      provider: config.provider, email: config.imapUser, hasPassword: true, times: normalizeTimes(config.times), enabled: config.enabled,
      lastRunAt: config.lastRunAt, lastSuccessAt: config.lastSuccessAt, lastStatus: config.lastStatus, lastError: config.lastError,
      running: Boolean(config.runningSince), pendingRun: Boolean(config.runRequestedAt && (!config.lastRunAt || config.runRequestedAt > config.lastRunAt)), summary,
    } : null,
    bills,
  };
}

async function guard(request: Request | null, context: Context) {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Accesso richiesto" }, { status: 401 }) };
  if (request) { try { assertSameOrigin(request); } catch { return { error: Response.json({ error: "Origine richiesta non valida" }, { status: 403 }) }; } }
  const accountId = Number((await context.params).accountId);
  if (!await ownAccount(accountId, user.email)) return { error: Response.json({ error: "Conto non trovato o non compatibile" }, { status: 404 }) };
  return { user, accountId };
}

export async function GET(_: Request, context: Context) {
  const ctx = await guard(null, context);
  if ("error" in ctx) return ctx.error;
  return Response.json(await status(ctx.accountId, ctx.user.email), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, context: Context) {
  const ctx = await guard(request, context);
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { provider?: string; email?: string; password?: string; times?: unknown; enabled?: boolean };
  if (!getEnergyProvider(body.provider)) return Response.json({ error: "Fornitore non supportato" }, { status: 400 });
  const email = String(body.email || "").trim().toLowerCase();
  if (!isGmailAddress(email)) return Response.json({ error: GMAIL_ONLY_MESSAGE }, { status: 400 });
  const times = normalizeTimes(body.times);
  const password = String(body.password || "").replace(/\s+/g, "");
  const db = getDb();
  const [existing] = await db.select().from(energyMailConfigs).where(eq(energyMailConfigs.accountId, ctx.accountId)).limit(1);
  if (!existing && !password) return Response.json({ error: "Inserisci la password per le app di Google" }, { status: 400 });
  if (password && (password.length < 8 || password.length > 100)) return Response.json({ error: "La password per le app non sembra valida" }, { status: 400 });
  const secret = password ? await encryptSecret(password, passwordContext(ctx.user.email, ctx.accountId)) : null;
  const values = {
    provider: body.provider as string, imapUser: email, times: JSON.stringify(times), enabled: body.enabled !== false, updatedAt: now(),
    ...(secret ? { encryptedPassword: secret.encrypted, passwordIv: secret.iv } : {}),
  };
  if (existing) await db.update(energyMailConfigs).set(values).where(eq(energyMailConfigs.id, existing.id));
  else await db.insert(energyMailConfigs).values({ ownerEmail: ctx.user.email, accountId: ctx.accountId, ...values, encryptedPassword: secret!.encrypted, passwordIv: secret!.iv, createdAt: now() });
  return Response.json(await status(ctx.accountId, ctx.user.email));
}

export async function DELETE(request: Request, context: Context) {
  const ctx = await guard(request, context);
  if ("error" in ctx) return ctx.error;
  await getDb().delete(energyMailConfigs).where(and(eq(energyMailConfigs.accountId, ctx.accountId), eq(energyMailConfigs.ownerEmail, ctx.user.email)));
  return Response.json({ ok: true });
}

export async function POST(request: Request, context: Context) {
  const ctx = await guard(request, context);
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { action?: string };
  const [config] = await getDb().select().from(energyMailConfigs).where(and(eq(energyMailConfigs.accountId, ctx.accountId), eq(energyMailConfigs.ownerEmail, ctx.user.email))).limit(1);
  if (!config) return Response.json({ error: "Salva prima la configurazione" }, { status: 400 });
  if (body.action === "run") {
    await getDb().update(energyMailConfigs).set({ runRequestedAt: now(), runMode: null, lastError: null }).where(eq(energyMailConfigs.id, config.id));
    return Response.json(await status(ctx.accountId, ctx.user.email));
  }
  if (body.action === "full-scan") {
    // Scansione completa di tutte le cartelle: rilegge ogni email del fornitore e completa i dati mancanti.
    await getDb().update(energyMailConfigs).set({ runRequestedAt: now(), runMode: "full", lastError: null }).where(eq(energyMailConfigs.id, config.id));
    return Response.json(await status(ctx.accountId, ctx.user.email));
  }
  if (body.action === "apply") {
    // Riapplica le bollette già lette (utile dopo aver impostato la fornitura sulle spese).
    await applyPendingBills(ctx.user.email, ctx.accountId);
    return Response.json(await status(ctx.accountId, ctx.user.email));
  }
  return Response.json({ error: "Operazione non valida" }, { status: 400 });
}
