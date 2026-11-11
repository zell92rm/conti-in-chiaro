import { env } from "cloudflare:workers";

/** Verifica del token condiviso tra l'app e il worker di lettura email (confronto a tempo costante). */
export function isMailSyncRequest(request: Request): boolean {
  const expected = env.MAIL_SYNC_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || expected.length < 16 || given.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index++) diff |= expected.charCodeAt(index) ^ given.charCodeAt(index);
  return diff === 0;
}
