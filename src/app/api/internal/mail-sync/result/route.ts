import { recordRunResult, type IncomingMail } from "../../../../../lib/mail-sync";
import { isMailSyncRequest } from "../../../../../lib/mail-sync-auth";

export async function POST(request: Request) {
  if (!isMailSyncRequest(request)) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const body = await request.json().catch(() => null) as { configId?: number; error?: string; mails?: IncomingMail[] } | null;
  if (!body || !Number.isInteger(body.configId)) return Response.json({ error: "Richiesta non valida" }, { status: 400 });
  const mails = Array.isArray(body.mails) ? body.mails.filter((mail) => mail && typeof mail.emailId === "string" && typeof mail.subject === "string").slice(0, 2000) : [];
  const result = await recordRunResult(body.configId as number, { mails, error: typeof body.error === "string" ? body.error : undefined });
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
