import { requireUser } from "./auth";
import ExpenseApp from "./expense-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser("/");
  return <ExpenseApp displayName={user.displayName} />;
}
