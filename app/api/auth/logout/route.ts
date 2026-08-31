import { assertSameOrigin, clearSessionCookie, deleteCurrentSession } from "../../../auth";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await deleteCurrentSession();
  return new Response(null, { status: 303, headers: {
    Location: new URL("/login", request.url).toString(),
    "Set-Cookie": clearSessionCookie(new URL(request.url).protocol === "https:"),
  } });
}
