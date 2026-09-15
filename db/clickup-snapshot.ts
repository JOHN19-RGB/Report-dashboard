import { eq } from "drizzle-orm";
import { getDbOrNull } from ".";
import { clickUpSnapshots } from "./schema";

export type ClickUpSnapshot = Record<string, unknown> & { syncedAt: string };

const CACHE_NAMESPACE = "work-report-dashboard-clickup";

function cacheKey(snapshotId: number) {
  return `snapshot-${snapshotId}`;
}

async function encodeSnapshot(payload: ClickUpSnapshot) {
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

async function decodeSnapshot(value: string) {
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

export async function readClickUpSnapshot(snapshotId: number) {
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

export async function saveClickUpSnapshot(snapshotId: number, payload: ClickUpSnapshot) {
  try {
    const encoded = await encodeSnapshot(payload);
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
    if (!cache) return false;
    await cache.set(cacheKey(snapshotId), encoded, {
      name: `ClickUp snapshot ${snapshotId}`,
      tags: [CACHE_NAMESPACE],
    });
    return true;
  } catch (error) {
    console.error(`ClickUp snapshot ${snapshotId} save failed`, error);
    return false;
  }
}
