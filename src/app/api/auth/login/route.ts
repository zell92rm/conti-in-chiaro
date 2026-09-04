import { authenticate, assertSameOrigin, createSession, safeReturnTo, sessionCookie } from "../../../auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const form = await request.formData();
    const returnTo = safeReturnTo(String(form.get("return_to") || "/"));
    const user = await authenticate(String(form.get("email") || ""), String(form.get("password") || ""), request);
    if (!user) return redirectWithError(request, "/login", "Email o password non corretti.", returnTo);
    return new Response(null, { status: 303, headers: {
      Location: new URL(returnTo, request.url).toString(),
      "Set-Cookie": sessionCookie(await createSession(user.id), new URL(request.url).protocol === "https:"),
    } });
  } catch (error) {
    return redirectWithError(request, "/login", error instanceof Error ? error.message : "Accesso non riuscito.", "/");
  }
}

function redirectWithError(request: Request, path: string, error: string, returnTo: string) {
  const url = new URL(path, request.url); url.searchParams.set("error", error); url.searchParams.set("return_to", returnTo);
  return new Response(null, { status: 303, headers: { Location: url.toString() } });
}
