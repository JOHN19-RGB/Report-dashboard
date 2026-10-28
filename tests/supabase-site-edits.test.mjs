import assert from "node:assert/strict";
import test from "node:test";
import { importTs } from "./helpers/load-ts.mjs";

const { supabaseConfig, listSupabaseSiteEdits, saveSupabaseSiteEdit, deleteSupabaseSiteEdit } = await importTs("db/supabase-site-edits.ts");

const config = { url: "https://example.supabase.co", key: "sb_secret_test" };

function mockFetch(t, respond) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return respond(url, init); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test("config reads our env names and the Vercel integration names, and requires https + key", () => {
  assert.deepEqual(supabaseConfig({ SUPABASE_URL: "https://a.supabase.co/", SUPABASE_SECRET_KEY: " sb_secret_1 " }), { url: "https://a.supabase.co", key: "sb_secret_1" });
  assert.deepEqual(supabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://b.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "eyJ" }), { url: "https://b.supabase.co", key: "eyJ" });
  assert.equal(supabaseConfig({ SUPABASE_URL: "https://a.supabase.co" }), null);
  assert.equal(supabaseConfig({ SUPABASE_URL: "http://a.supabase.co", SUPABASE_SECRET_KEY: "k" }), null);
  assert.equal(supabaseConfig({}), null);
});

test("list maps rows and keeps payload as a JSON string", async t => {
  const calls = mockFetch(t, () => Response.json([{ id: "d:a.mn", payload: { isNew: true, site: { domain: "a.mn" } }, updated_at: "2026-10-27T01:00:00+00:00", updated_by: null }]));
  const rows = await listSupabaseSiteEdits(config);
  assert.deepEqual(rows, [{ id: "d:a.mn", payload: '{"isNew":true,"site":{"domain":"a.mn"}}', updatedAt: "2026-10-27T01:00:00+00:00", updatedBy: null }]);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/customer_site_edits?select=id,payload,updated_at,updated_by&order=updated_at.asc");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_test");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sb_secret_test");
  assert.equal(calls[0].init.cache, "no-store");
});

test("save upserts on id with the payload as JSON", async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 201 }));
  await saveSupabaseSiteEdit(config, { id: "d:a.mn", payload: '{"isNew":false}', updatedAt: "2026-10-27T01:00:00.000Z", updatedBy: "me@example.com" });
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/customer_site_edits?on_conflict=id");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: "d:a.mn", payload: { isNew: false }, updated_at: "2026-10-27T01:00:00.000Z", updated_by: "me@example.com" });
});

test("delete encodes the id filter", async t => {
  const calls = mockFetch(t, () => new Response(null, { status: 204 }));
  await deleteSupabaseSiteEdit(config, "c:бүрэн трэйд&x");
  assert.equal(calls[0].url, `https://example.supabase.co/rest/v1/customer_site_edits?id=eq.${encodeURIComponent("c:бүрэн трэйд&x")}`);
  assert.equal(calls[0].init.method, "DELETE");
});

test("errors carry the status and response text", async t => {
  mockFetch(t, () => new Response('{"message":"permission denied"}', { status: 401 }));
  await assert.rejects(listSupabaseSiteEdits(config), /failed \(401\): .*permission denied/);
});
