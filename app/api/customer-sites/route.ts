import { customerEditsAvailable, deleteCustomerSiteEdit, saveCustomerSiteEdit } from "../../../db/customer-sites";
import customerFile from "../../data/customer-file.json";
import customerPayments from "../../data/customer-payments.json";
import {
  applySiteEdits,
  customerSiteId,
  normalizeDomain,
  parseSiteEditInput,
  type CustomerFileData,
  type CustomerPaymentData,
} from "../../lib/customer-file";
import { EDIT_COOKIE, editAccess, requestCookie } from "../../lib/customer-edit-access";
import { loadCustomerSiteEdits } from "../../lib/customer-file-server";

const BASE_SITES = (customerFile as CustomerFileData).sites;
const PROVIDER_KEYS = new Set((customerPayments as CustomerPaymentData).categories.flatMap(category => category.providers.map(provider => provider.key)));
const MAX_BODY_BYTES = 20_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const STORE_FAILED = "Өгөгдлийн сантай холбогдож чадсангүй. Дахин оролдоно уу.";

// Storage must be configured and, when a passcode is set, this browser must have unlocked editing.
async function denied(request: Request) {
  if (!customerEditsAvailable()) return json({ error: "Өгөгдлийн сан холбогдоогүй тул хадгалах боломжгүй." }, 503);
  const access = await editAccess(requestCookie(request, EDIT_COOKIE));
  if (access === "disabled") return json({ error: "Засварлах passcode тохируулаагүй байна." }, 503);
  if (access === "locked") return json({ error: "Засварлахын тулд passcode оруулна уу.", locked: true }, 401);
  return null;
}

// Reject cross-site form posts; the dashboard itself always sends same-origin requests.
function crossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && new URL(origin).host !== new URL(request.url).host;
}

export async function POST(request: Request) {
  if (crossOrigin(request)) return json({ error: "Forbidden" }, 403);
  const blocked = await denied(request);
  if (blocked) return blocked;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Хүсэлт хэт том байна." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "JSON буруу байна." }, 400); }

  const parsed = parseSiteEditInput(body, PROVIDER_KEYS);
  if (!parsed.ok) return json({ errors: parsed.errors }, 422);

  const edits = await loadCustomerSiteEdits();
  const sites = applySiteEdits(BASE_SITES, edits);
  const requestedId = typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : null;
  const existing = requestedId ? sites.find(site => site.id === requestedId) : null;
  if (requestedId && !existing) return json({ error: "Сайт олдсонгүй." }, 404);

  const id = existing?.id ?? customerSiteId(parsed.value.site.domain, parsed.value.site.company);
  const domain = parsed.value.site.domain!;
  const duplicate = sites.find(site => site.id !== existing?.id && (site.id === id || (site.domain && normalizeDomain(site.domain) === domain)));
  if (duplicate) return json({ errors: { domain: `${domain} аль хэдийн бүртгэлтэй байна.` } }, 409);

  const updatedAt = new Date().toISOString();
  const updatedBy = request.headers.get("oai-authenticated-user-email");
  try {
    await saveCustomerSiteEdit({ id, payload: JSON.stringify({ isNew: existing ? Boolean(existing.edit?.isNew) : true, ...parsed.value }), updatedAt, updatedBy });
  } catch (error) {
    console.error("Customer site edit save failed", error);
    return json({ error: STORE_FAILED }, 502);
  }
  return json({ id, updatedAt });
}

export async function DELETE(request: Request) {
  if (crossOrigin(request)) return json({ error: "Forbidden" }, 403);
  const blocked = await denied(request);
  if (blocked) return blocked;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "id шаардлагатай." }, 400);
  try {
    await deleteCustomerSiteEdit(id);
  } catch (error) {
    console.error("Customer site edit delete failed", error);
    return json({ error: STORE_FAILED }, 502);
  }
  return json({ id });
}
