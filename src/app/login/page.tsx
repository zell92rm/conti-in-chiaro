import { redirect } from "next/navigation";
import { getCurrentUser, hasRegisteredUser, safeReturnTo } from "../auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; return_to?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  if (!(await hasRegisteredUser())) redirect("/register");
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">CONTI IN CHIARO</p>
        <h1>Bentornato</h1>
        <p>Accedi al tuo spazio finanziario privato.</p>
        {params.error && <p className="auth-error" role="alert">{params.error}</p>}
        <form action="/api/auth/login" method="post" className="auth-form" autoComplete="on">
          <input type="hidden" name="return_to" value={safeReturnTo(params.return_to ?? "/")} />
          <label htmlFor="login-email"><span>Email</span><input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus /></label>
          <label htmlFor="login-password"><span>Password</span><input id="login-password" name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Accedi</button>
        </form>
        <p className="auth-footnote">Hai dimenticato la password? Il ripristino richiede l’accesso amministrativo al database.</p>
      </section>
    </main>
  );
}
