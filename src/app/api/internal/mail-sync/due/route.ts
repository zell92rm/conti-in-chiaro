import { claimDueJobs } from "../../../../../lib/mail-sync";
import { isMailSyncRequest } from "../../../../../lib/mail-sync-auth";

export async function GET(request: Request) {
  if (!isMailSyncRequest(request)) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  return Response.json({ jobs: await claimDueJobs() }, { headers: { "Cache-Control": "no-store" } });
}
