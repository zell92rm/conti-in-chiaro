import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accountOpenBankingLinks, userOpenBankingConfig } from "../../../../db/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const [config] = await getDb().select({ status: userOpenBankingConfig.status }).from(userOpenBankingConfig).where(and(eq(userOpenBankingConfig.userId, user.id), eq(userOpenBankingConfig.provider, "ENABLE_BANKING"), inArray(userOpenBankingConfig.status, ["CONFIGURED", "VALID"]))).limit(1);
  if (!config) return Response.json({ links: [] });
  const links = await getDb().select({ accountId: accountOpenBankingLinks.accountId, bankName: accountOpenBankingLinks.bankName, status: accountOpenBankingLinks.status }).from(accountOpenBankingLinks).where(and(eq(accountOpenBankingLinks.userId, user.id), eq(accountOpenBankingLinks.provider, "ENABLE_BANKING")));
  return Response.json({ links });
}
