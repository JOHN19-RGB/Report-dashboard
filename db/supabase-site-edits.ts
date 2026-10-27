// Customer file additions/edits stored in Supabase Postgres (table `customer_site_edits`, see supabase/migrations).
// Server-only: the table has RLS on and no policies, so it is reachable only with the project's secret key.

export type StoredSiteEdit = { id: string; payload: string; updatedAt: string; updatedBy: string | null };

type Row = { id: string; payload: unknown; updated_at: string; updated_by: string | null };
type SupabaseConfig = { url: string; key: string };

const TABLE = "customer_site_edits";
const TIMEOUT_MS = 8000;

// Accepts both our own names and the ones the Vercel ↔ Supabase integration injects.
export function supabaseConfig(env: Record<string, string | undefined> = process.env): SupabaseConfig | null {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return /^https:\/\/\S+$/.test(url) && key ? { url, key } : null;
}

async function request(config: SupabaseConfig, path: string, init: RequestInit & { prefer?: string } = {}) {
  const { prefer, ...rest } = init;
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...rest,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Supabase ${rest.method ?? "GET"} ${TABLE} failed (${response.status}): ${detail}`);
  }
  return response;
}

export async function listSupabaseSiteEdits(config: SupabaseConfig): Promise<StoredSiteEdit[]> {
  const response = await request(config, `${TABLE}?select=id,payload,updated_at,updated_by&order=updated_at.asc`);
  const rows = await response.json() as Row[];
  return rows.map(row => ({
    id: row.id,
    payload: typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function saveSupabaseSiteEdit(config: SupabaseConfig, edit: StoredSiteEdit) {
  await request(config, `${TABLE}?on_conflict=id`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ id: edit.id, payload: JSON.parse(edit.payload), updated_at: edit.updatedAt, updated_by: edit.updatedBy }),
  });
}

export async function deleteSupabaseSiteEdit(config: SupabaseConfig, id: string) {
  await request(config, `${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
}
