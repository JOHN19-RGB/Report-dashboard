// Who may add, edit or delete Customer file sites. Viewing is unaffected.
// With CUSTOMER_FILE_EDIT_PASSCODE set, saving needs a cookie proving the passcode was entered; the cookie holds an
// HMAC of the passcode (never the passcode), so changing the passcode signs every browser out.
// On Vercel without a passcode, editing stays off rather than open to anyone with the link.

export type EditAccess = "open" | "locked" | "unlocked" | "disabled";

export const EDIT_COOKIE = "customer_file_edit";
export const EDIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function editPasscode(env: Record<string, string | undefined> = process.env) {
  return env.CUSTOMER_FILE_EDIT_PASSCODE?.trim() || null;
}

async function sign(passcode: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("customer-file-edit:v1"));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Compares equal-length tokens without an early exit.
function sameToken(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function editAccess(cookie: string | undefined, env: Record<string, string | undefined> = process.env): Promise<EditAccess> {
  const passcode = editPasscode(env);
  if (!passcode) return env.VERCEL ? "disabled" : "open";
  return cookie && sameToken(cookie, await sign(passcode)) ? "unlocked" : "locked";
}

// Returns the cookie value to set when the passcode matches, otherwise null.
export async function unlockToken(input: string, env: Record<string, string | undefined> = process.env) {
  const passcode = editPasscode(env);
  if (!passcode) return null;
  const [expected, given] = await Promise.all([sign(passcode), sign(input.trim())]);
  return sameToken(given, expected) ? expected : null;
}

export function requestCookie(request: Request, name: string) {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function editCookieHeader(request: Request, value: string | null) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return value
    ? `${EDIT_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${EDIT_COOKIE_MAX_AGE}${secure}`
    : `${EDIT_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
