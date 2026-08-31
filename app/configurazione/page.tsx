import { requireUser } from "../auth";
import CategorySettings from "./category-settings";

export const dynamic = "force-dynamic";

export default async function ConfigurazionePage() {
  await requireUser("/configurazione");
  return <CategorySettings />;
}
