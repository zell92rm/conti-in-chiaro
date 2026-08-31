import { assertSameOrigin, createSession, hasRegisteredUser, registerFirstUser, sessionCookie } from "../../../auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (await hasRegisteredUser()) return new Response(null, { status: 303, headers: { Location: new URL("/login?error=Account+già+configurato.", request.url).toString() } });
    const form = await request.formData();
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirm_password") || "")) throw new Error("Le password non coincidono.");
    const user = await registerFirstUser({ displayName: String(form.get("display_name") || ""), email: String(form.get("email") || ""), password });
    return new Response(null, { status: 303, headers: {
      Location: new URL("/", request.url).toString(),
      "Set-Cookie": sessionCookie(await createSession(user.id), new URL(request.url).protocol === "https:"),
    } });
  } catch (error) {
    const url = new URL("/register", request.url); url.searchParams.set("error", error instanceof Error ? error.message : "Registrazione non riuscita.");
    return new Response(null, { status: 303, headers: { Location: url.toString() } });
  }
}
