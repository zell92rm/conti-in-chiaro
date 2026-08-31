import { redirect } from "next/navigation";
import { getCurrentUser, hasRegisteredUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  if (await hasRegisteredUser()) redirect("/login");
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">PRIMA CONFIGURAZIONE</p>
        <h1>Crea il tuo account</h1>
        <p>La registrazione verrà chiusa dopo la creazione del primo account.</p>
        {params.error && <p className="auth-error" role="alert">{params.error}</p>}
        <form action="/api/auth/register" method="post" className="auth-form" autoComplete="on">
          <label><span>Nome</span><input name="display_name" autoComplete="name" minLength={2} maxLength={80} required autoFocus /></label>
          <label><span>Email</span><input name="email" type="email" autoComplete="username" inputMode="email" required /></label>
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label><span>Conferma password</span><input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <button type="submit">Crea account</button>
        </form>
      </section>
    </main>
  );
}
