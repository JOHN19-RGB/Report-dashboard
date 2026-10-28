import { eq } from "drizzle-orm";
import { getDbOrNull } from ".";
import { clickUpSnapshots } from "./schema";
import { supabaseConfig, supabaseSelect, supabaseUpsert, type SupabaseConfig } from "./supabase";

export type ClickUpSnapshot = Record<string, unknown> & { syncedAt: string };

// Where the latest report snapshot (1 = CX, 2 = Dev) lives, in order of preference:
//   1. Supabase `clickup_snapshots` — shared by every Vercel region and kept across deploys; each save also logs a
//      row in `clickup_sync_runs`.
//   2. Local Cloudflare D1 (vinext dev without Supabase settings).
//   3. Vercel Runtime Cache — region-local and evictable; kept as a fallback copy when Supabase is unreachable.
// Payloads are stored gzip+base64 (a 5 MB Dev report is ~0.7 MB), the same encoding in every backend.

const CACHE_NAMESPACE = "work-report-dashboard-clickup";
const SNAPSHOT_KINDS: Record<number, string> = { 1: "cx", 2: "dev" };
const SUPABASE_TIMEOUT_MS = 20_000;

function cacheKey(snapshotId: number) {
  return `snapshot-${snapshotId}`;
}

export async function encodeSnapshot(payload: ClickUpSnapshot) {
  const compressed = new Blob([JSON.stringify(payload)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export async function decodeSnapshot(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const decompressed = new Response(bytes.buffer).body!.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(decompressed).text()) as ClickUpSnapshot;
}

async function getVercelCache() {
  if (!process.env.VERCEL) return null;
  const { getCache } = await import("@vercel/functions");
  return getCache({ namespace: CACHE_NAMESPACE });
}

// ---- Supabase ------------------------------------------------------------------------------------------------

// Per-instance copy of the last decoded snapshot. A read first asks Supabase only for `synced_at`; the ~0.7 MB
// payload is downloaded again only when another instance has saved a newer snapshot.
const memory = new Map<number, { syncedAt: string; payload: ClickUpSnapshot }>();

export function clearClickUpSnapshotMemory() {
  memory.clear();
}

async function readSupabaseSnapshot(config: SupabaseConfig, snapshotId: number) {
  const [meta] = await supabaseSelect<{ synced_at: string }>(config, `clickup_snapshots?select=synced_at&id=eq.${snapshotId}`);
  if (!meta) return null;
  const remembered = memory.get(snapshotId);
  if (remembered && Date.parse(remembered.syncedAt) === Date.parse(meta.synced_at)) return remembered.payload;
  const [row] = await supabaseSelect<{ payload_gzip: string }>(config, `clickup_snapshots?select=payload_gzip&id=eq.${snapshotId}`, SUPABASE_TIMEOUT_MS);
  if (!row) return null;
  const payload = await decodeSnapshot(row.payload_gzip);
  memory.set(snapshotId, { syncedAt: payload.syncedAt, payload });
  return payload;
}

const count = (value: unknown) => Array.isArray(value) ? value.length : null;
const text = (value: unknown) => typeof value === "string" && value ? value : null;
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : null;

async function saveSupabaseSnapshot(config: SupabaseConfig, snapshotId: number, payload: ClickUpSnapshot, encoded: string) {
  await supabaseUpsert(config, "clickup_snapshots", {
    id: snapshotId,
    kind: SNAPSHOT_KINDS[snapshotId] ?? `snapshot-${snapshotId}`,
    payload_gzip: encoded,
    schema_version: integer(payload.schemaVersion),
    synced_at: payload.syncedAt,
    task_count: count(payload.tasks) ?? count(payload.subtasks),
    partial: payload.partial === true,
    size_bytes: encoded.length,
    updated_at: new Date().toISOString(),
  }, "id", SUPABASE_TIMEOUT_MS);
  memory.set(snapshotId, { syncedAt: payload.syncedAt, payload });
}

async function logSyncRun(config: SupabaseConfig, row: Record<string, unknown>) {
  try {
    await supabaseUpsert(config, "clickup_sync_runs", row);
  } catch (error) {
    console.error("ClickUp sync log write failed", error);
  }
}

/** Records a failed ClickUp refresh in the sync log (no-op without Supabase). */
export async function recordClickUpSyncFailure(snapshotId: number, trigger: string | null, error: unknown) {
  const config = supabaseConfig();
  if (!config) return;
  await logSyncRun(config, {
    snapshot_id: snapshotId,
    kind: SNAPSHOT_KINDS[snapshotId] ?? null,
    ok: false,
    trigger,
    error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
  });
}

// ---- Public API ----------------------------------------------------------------------------------------------

export async function readClickUpSnapshot(snapshotId: number) {
  const config = supabaseConfig();
  if (config) {
    try {
      const payload = await readSupabaseSnapshot(config, snapshotId);
      if (payload) return payload;
    } catch (error) {
      console.error(`ClickUp snapshot ${snapshotId} Supabase read failed`, error);
    }
  }
  try {
    const db = getDbOrNull();
    if (db) {
      const [row] = await db
        .select()
        .from(clickUpSnapshots)
        .where(eq(clickUpSnapshots.id, snapshotId))
        .limit(1);
      return row ? decodeSnapshot(row.payload) : null;
    }

    const cache = await getVercelCache();
    const encoded = await cache?.get(cacheKey(snapshotId));
    return typeof encoded === "string" ? decodeSnapshot(encoded) : null;
  } catch (error) {
    console.error(`ClickUp snapshot ${snapshotId} read failed`, error);
    return null;
  }
}

export async function saveClickUpSnapshot(snapshotId: number, payload: ClickUpSnapshot, trigger: string | null = null) {
  let encoded: string;
  try {
    encoded = await encodeSnapshot(payload);
  } catch (error) {
    console.error(`ClickUp snapshot ${snapshotId} encode failed`, error);
    return false;
  }

  let saved = false;
  const config = supabaseConfig();
  if (config) {
    try {
      await saveSupabaseSnapshot(config, snapshotId, payload, encoded);
      saved = true;
      await logSyncRun(config, {
        snapshot_id: snapshotId,
        kind: SNAPSHOT_KINDS[snapshotId] ?? null,
        ok: true,
        trigger,
        mode: text(payload.syncMode) ?? text(payload.taskSyncMode) ?? "full",
        task_count: count(payload.tasks) ?? count(payload.subtasks),
        delta_count: integer(payload.deltaTaskCount) ?? integer(payload.taskDeltaCount),
        partial: payload.partial === true,
        size_bytes: encoded.length,
        synced_at: payload.syncedAt,
      });
    } catch (error) {
      console.error(`ClickUp snapshot ${snapshotId} Supabase save failed`, error);
    }
  }

  try {
    const db = getDbOrNull();
    if (db) {
      await db
        .insert(clickUpSnapshots)
        .values({ id: snapshotId, payload: encoded, syncedAt: payload.syncedAt })
        .onConflictDoUpdate({
          target: clickUpSnapshots.id,
          set: { payload: encoded, syncedAt: payload.syncedAt },
        });
      return true;
    }

    const cache = await getVercelCache();
    if (!cache) return saved;
    await cache.set(cacheKey(snapshotId), encoded, {
      name: `ClickUp snapshot ${snapshotId}`,
      tags: [CACHE_NAMESPACE],
    });
    return true;
  } catch (error) {
    console.error(`ClickUp snapshot ${snapshotId} save failed`, error);
    return saved;
  }
}
