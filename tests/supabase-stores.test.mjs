import assert from "node:assert/strict";
import test from "node:test";
import { importTs } from "./helpers/load-ts.mjs";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
delete process.env.VERCEL;

const snapshots = await importTs("db/clickup-snapshot.ts");
const ai = await importTs("db/ai-summaries.ts");

const REST = "https://example.supabase.co/rest/v1/";

function mockFetch(t, respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const call = { path: String(url).slice(REST.length), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, prefer: init.headers?.Prefer };
    calls.push(call);
    return respond(call);
  };
  t.after(() => { globalThis.fetch = original; snapshots.clearClickUpSnapshotMemory(); });
  return calls;
}

const payload = { syncedAt: "2026-10-28T02:00:00.000Z", schemaVersion: 3, tasks: [{ id: "a" }, { id: "b" }], syncMode: "delta", deltaTaskCount: 1 };

test("saving a snapshot upserts it on id and logs a successful sync run", async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 201 }));
  assert.equal(await snapshots.saveClickUpSnapshot(1, payload, "?refresh=1"), true);

  assert.equal(calls.length, 2);
  const [upsert, log] = calls;
  assert.equal(upsert.path, "clickup_snapshots?on_conflict=id");
  assert.equal(upsert.prefer, "resolution=merge-duplicates,return=minimal");
  assert.equal(upsert.body.kind, "cx");
  assert.equal(upsert.body.schema_version, 3);
  assert.equal(upsert.body.task_count, 2);
  assert.equal(upsert.body.partial, false);
  assert.equal(upsert.body.size_bytes, upsert.body.payload_gzip.length);
  assert.deepEqual(await snapshots.decodeSnapshot(upsert.body.payload_gzip), payload);

  assert.equal(log.path, "clickup_sync_runs");
  assert.equal(log.method, "POST");
  assert.deepEqual({ ...log.body }, { snapshot_id: 1, kind: "cx", ok: true, trigger: "?refresh=1", mode: "delta", task_count: 2, delta_count: 1, partial: false, size_bytes: upsert.body.size_bytes, synced_at: payload.syncedAt });
});

test("a read after a save on the same instance only checks synced_at", async t => {
  const saveCalls = mockFetch(t, () => new Response(null, { status: 201 }));
  await snapshots.saveClickUpSnapshot(2, payload);
  saveCalls.length = 0;

  globalThis.fetch = async (url, init = {}) => {
    saveCalls.push({ path: String(url).slice(REST.length), method: init.method ?? "GET" });
    return Response.json([{ synced_at: "2026-10-28T02:00:00+00:00" }]);
  };
  assert.deepEqual(await snapshots.readClickUpSnapshot(2), payload);
  assert.deepEqual(saveCalls.map(call => call.path), ["clickup_snapshots?select=synced_at&id=eq.2"]);
});

test("a newer snapshot saved elsewhere is downloaded and decoded", async t => {
  const newer = { ...payload, syncedAt: "2026-10-28T03:00:00.000Z" };
  const encoded = await snapshots.encodeSnapshot(newer);
  const calls = mockFetch(t, call => call.path.includes("select=synced_at")
    ? Response.json([{ synced_at: newer.syncedAt }])
    : Response.json([{ payload_gzip: encoded }]));
  assert.deepEqual(await snapshots.readClickUpSnapshot(1), newer);
  assert.deepEqual(calls.map(call => call.path), ["clickup_snapshots?select=synced_at&id=eq.1", "clickup_snapshots?select=payload_gzip&id=eq.1"]);
});

test("Supabase failures fall through without throwing", async t => {
  mockFetch(t, () => new Response("boom", { status: 500 }));
  t.mock.method(console, "error", () => {});
  assert.equal(await snapshots.readClickUpSnapshot(1), null);
  assert.equal(await snapshots.saveClickUpSnapshot(1, payload), false);
});

test("a failed refresh is logged with its error", async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 201 }));
  await snapshots.recordClickUpSyncFailure(2, "?force=1", new Error("ClickUp 429"));
  assert.deepEqual(calls.map(call => [call.path, call.body]), [["clickup_sync_runs", { snapshot_id: 2, kind: "dev", ok: false, trigger: "?force=1", error: "ClickUp 429" }]]);
});

test("AI cache keys are stable sha256 hex and change with the prompt or model", async () => {
  const key = await ai.aiCacheKey("cx-summary", ["model-a", "prompt"]);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(await ai.aiCacheKey("cx-summary", ["model-a", "prompt"]), key);
  assert.notEqual(await ai.aiCacheKey("cx-summary", ["model-a", "prompt 2"]), key);
  assert.notEqual(await ai.aiCacheKey("cx-summary", ["model-b", "prompt"]), key);
  assert.notEqual(await ai.aiCacheKey("dev-filter-intro", ["model-a", "prompt"]), key);
});

test("AI cache reads text, and treats misses and errors as no cache", async t => {
  let respond = () => Response.json([{ text: "Cached summary" }]);
  const calls = mockFetch(t, call => respond(call));
  assert.equal(await ai.readAiText("abc"), "Cached summary");
  assert.equal(calls[0].path, "ai_summaries?select=text&key=eq.abc");

  respond = () => Response.json([]);
  assert.equal(await ai.readAiText("abc"), null);

  respond = () => new Response("down", { status: 503 });
  t.mock.method(console, "error", () => {});
  assert.equal(await ai.readAiText("abc"), null);
});

test("AI cache saves upsert on key", async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 201 }));
  await ai.saveAiText("abc", "comparison-intro", "openai/gpt-oss-120b", "Оршил.");
  assert.equal(calls[0].path, "ai_summaries?on_conflict=key");
  assert.deepEqual({ ...calls[0].body, created_at: "x" }, { key: "abc", kind: "comparison-intro", model: "openai/gpt-oss-120b", text: "Оршил.", created_at: "x" });
});
