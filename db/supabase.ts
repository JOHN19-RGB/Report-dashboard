// Shared server-only access to the project's Supabase Postgres over its REST API (PostgREST).
// Every table this app uses has RLS on with no policies, so only the secret key used here can read or write it.
// Stores built on this: customer site edits, ClickUp snapshots + sync log, AI summary cache (see supabase/migrations).

export type SupabaseConfig = { url: string; key: string };

const TIMEOUT_MS = 10_000;

// Accepts both our own names and the ones the Vercel ↔ Supabase integration injects.
export function supabaseConfig(env: Record<string, string | undefined> = process.env): SupabaseConfig | null {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return /^https:\/\/\S+$/.test(url) && key ? { url, key } : null;
}

export class SupabaseError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** `path` is relative to /rest/v1/, e.g. `clickup_snapshots?id=eq.1`. Throws SupabaseError on non-2xx. */
export async function supabaseRequest(config: SupabaseConfig, path: string, init: RequestInit & { prefer?: string; timeoutMs?: number } = {}) {
  const { prefer, timeoutMs = TIMEOUT_MS, ...rest } = init;
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...rest,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
  });
  if (!response.ok) {
    const table = path.split("?")[0];
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new SupabaseError(`Supabase ${rest.method ?? "GET"} ${table} failed (${response.status}): ${detail}`, response.status);
  }
  return response;
}

export async function supabaseSelect<T>(config: SupabaseConfig, path: string, timeoutMs?: number): Promise<T[]> {
  return await (await supabaseRequest(config, path, { timeoutMs })).json() as T[];
}

/** Insert, or update on primary-key conflict when `onConflict` is given. */
export async function supabaseUpsert(config: SupabaseConfig, table: string, row: Record<string, unknown>, onConflict?: string, timeoutMs?: number) {
  await supabaseRequest(config, onConflict ? `${table}?on_conflict=${onConflict}` : table, {
    method: "POST",
    prefer: onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    body: JSON.stringify(row),
    timeoutMs,
  });
}

export async function supabaseDelete(config: SupabaseConfig, path: string) {
  await supabaseRequest(config, path, { method: "DELETE", prefer: "return=minimal" });
}
