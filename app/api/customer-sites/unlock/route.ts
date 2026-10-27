import { editCookieHeader, editPasscode, unlockToken } from "../../../lib/customer-edit-access";

const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers });

function crossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && new URL(origin).host !== new URL(request.url).host;
}

export async function POST(request: Request) {
  if (crossOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!editPasscode()) return json({ error: "Passcode тохируулаагүй байна." }, 400);
  const body = await request.json().catch(() => null) as { passcode?: unknown } | null;
  const passcode = typeof body?.passcode === "string" ? body.passcode.slice(0, 200) : "";
  const token = passcode ? await unlockToken(passcode) : null;
  if (!token) {
    // Slows down guessing; there is no shared store for proper rate limiting.
    await new Promise(resolve => setTimeout(resolve, 800));
    return json({ error: "Passcode буруу байна." }, 401);
  }
  return json({ ok: true }, 200, { "Set-Cookie": editCookieHeader(request, token) });
}

export async function DELETE(request: Request) {
  if (crossOrigin(request)) return json({ error: "Forbidden" }, 403);
  return json({ ok: true }, 200, { "Set-Cookie": editCookieHeader(request, null) });
}
