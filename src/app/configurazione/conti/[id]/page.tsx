import { requireUser } from "../../../auth";
import AccountSettings from "../../account-settings";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/configurazione/conti/${id}`);
  return <AccountSettings accountId={Number(id)} />;
}
