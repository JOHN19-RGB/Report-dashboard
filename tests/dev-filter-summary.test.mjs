import assert from "node:assert/strict";
import test from "node:test";
import { importTs } from "./helpers/load-ts.mjs";

const { buildDevFilterSummary, DEV_FILTER_SUMMARY_INTRO, parseDevFilterSummaryInput, summaryPercentChange, verifiedDevFilterIntroduction } = await importTs("app/lib/dev-filter-summary.ts");
const { POST } = await importTs("app/api/summarize/dev/route.ts");

const input = {
  period: "Sprint 47–48",
  previousPeriod: "Sprint 45–46",
  filter: { taskType: "Бүх төрөл", sprint: "Sprint · 47–48", search: "" },
  breakdown: {
    types: [
      { name: "Imp", count: 99 },
      { name: "Bug", count: 11 },
      { name: "Not bug/imp", count: 6 },
      { name: "Task", count: 4 },
    ],
    statuses: [
      { name: "complete", count: 103 },
      { name: "rejected", count: 17 },
    ],
  },
  imp: {
    count: 99,
    estimateMinutes: 31_737,
    previousCount: 69,
    priorities: { urgent: 0, high: 21, medium: 14, low: 42, unspecified: 22 },
  },
  bug: { count: 11, estimateMinutes: 115, previousCount: 10 },
  partial: false,
};

test("filtered Dev summary reproduces the Imp and Bug template with exact facts", () => {
  const parsed = parseDevFilterSummaryInput(input);
  assert.ok(parsed);
  const summary = buildDevFilterSummary(parsed);
  assert.match(summary.impText, /нэмэлт хүсэлтийн 99 таск/);
  assert.match(summary.impText, /URGENT – 0, HIGH – 21, NORMAL – 14/);
  assert.doesNotMatch(summary.impText, /талбарын URGENT, HIGH, NORMAL/);
  assert.doesNotMatch(summary.impText, /MEDIUM|LOW|ТОДОРХОЙГҮЙ/);
  assert.match(summary.impText, /528 цаг 57 минут/);
  assert.match(summary.impText, /43\.5%-иар өссөн/);
  assert.match(summary.bugText, /нийт Bug 11/);
  assert.match(summary.bugText, /1 цаг 55 минут/);
  assert.match(summary.bugText, /10\.0%-иар өссөн/);
  assert.equal(summary.facts.imp.changePercent, summaryPercentChange(99, 69));
  assert.equal(summary.facts.bug.changePercent, 10);
  assert.deepEqual(summary.facts.breakdown, input.breakdown);
  assert.deepEqual(summary.facts.breakdown.types.map(item => item.name), ["Imp", "Bug", "Not bug/imp", "Task"]);
  assert.deepEqual(summary.facts.breakdown.statuses.map(item => item.name), ["complete", "rejected"]);
  assert.doesNotMatch(`${summary.impText} ${summary.bugText}`, /NaN|Infinity/);
});

test("summary input rejects mismatched priorities and invalid previous comparisons", () => {
  assert.equal(parseDevFilterSummaryInput({ ...input, imp: { ...input.imp, priorities: { ...input.imp.priorities, low: 41 } } }), null);
  assert.equal(parseDevFilterSummaryInput({ ...input, previousPeriod: "" }), null);
  assert.equal(parseDevFilterSummaryInput({ ...input, bug: { ...input.bug, count: -1 } }), null);
  assert.equal(parseDevFilterSummaryInput({ ...input, breakdown: { ...input.breakdown, statuses: [{ name: "complete", count: 119 }] } }), null);
  assert.equal(parseDevFilterSummaryInput({ ...input, breakdown: { ...input.breakdown, statuses: [{ name: "Rejected", count: 60 }, { name: "rejected", count: 60 }] } }), null);
  assert.equal(parseDevFilterSummaryInput({ ...input, breakdown: { ...input.breakdown, types: [{ name: "Imp", count: 0 }] } }), null);
  assert.ok(parseDevFilterSummaryInput({
    ...input,
    previousPeriod: "",
    imp: { ...input.imp, previousCount: null },
    bug: { ...input.bug, previousCount: null },
  }));
});

test("Groq wording cannot add numbers, causes, trends or omit Imp and Bug", () => {
  const safe = "Imp болон Bug таскийн шүүсэн бүртгэлийг priority, time estimate болон өмнөх sprint-ийн хүрээнд нэгтгэн харуулав.";
  assert.equal(verifiedDevFilterIntroduction(safe), safe);
  for (const candidate of [`${safe} 99`, `${safe} Үүний шалтгаан нь ачаалал.`, "Bug таскийн шүүсэн өгөгдлийг нэгтгэн харуулав."]) {
    assert.equal(verifiedDevFilterIntroduction(candidate), DEV_FILTER_SUMMARY_INTRO);
  }
});

test("Dev summary API uses Groq safely and preserves server-calculated template facts", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  const request = payload => new Request("http://localhost/api/summarize/dev", { method: "POST", body: JSON.stringify(payload) });
  try {
    delete process.env.GROQ_API_KEY;
    assert.equal((await POST(request({}))).status, 400);
    const local = await (await POST(request(input))).json();
    assert.equal(local.source, "local");
    assert.deepEqual(local.summary, buildDevFilterSummary(input));

    process.env.GROQ_API_KEY = "test-key-not-a-secret";
    const safe = "Imp болон Bug таскийн шүүсэн бүртгэлийг priority, time estimate болон өмнөх sprint-ийн хүрээнд нэгтгэн харуулав.";
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
    const groq = await (await POST(request(input))).json();
    assert.equal(groq.source, "groq");
    assert.equal(groq.summary.introduction, safe);
    assert.deepEqual(groq.summary.facts, buildDevFilterSummary(input).facts);
    assert.match(groq.summary.impText, /43\.5%-иар өссөн/);

    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: `${safe} 999` }) } }] });
    const rejected = await (await POST(request(input))).json();
    assert.equal(rejected.source, "local");
    assert.equal(rejected.summary.introduction, DEV_FILTER_SUMMARY_INTRO);

    process.env.GROQ_MODEL = "retired-model";
    const models = [];
    globalThis.fetch = async (_url, options) => {
      const model = JSON.parse(options.body).model;
      models.push(model);
      return model === "retired-model" ? new Response("Not found", { status: 404 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
    };
    assert.equal((await (await POST(request(input))).json()).source, "groq");
    assert.deepEqual(models, ["retired-model", "openai/gpt-oss-120b"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = originalModel;
  }
});

test("Dev filter summary reuses verified AI text cached in Supabase and stores new Groq text", async t => {
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  Object.assign(process.env, { GROQ_API_KEY: "test-key-not-a-secret", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test" });
  delete process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const request = () => new Request("http://localhost/api/summarize/dev", { method: "POST", body: JSON.stringify(input) });
  const safe = "Imp болон Bug таскийн шүүсэн бүртгэлийг priority, time estimate болон өмнөх sprint-ийн хүрээнд нэгтгэн харуулав.";

  const store = new Map();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.startsWith("https://example.supabase.co/rest/v1/ai_summaries")) {
      calls.push(`supabase ${options.method ?? "GET"}`);
      if (options.method === "POST") { const row = JSON.parse(options.body); store.set(row.key, row); return new Response(null, { status: 201 }); }
      const key = new URL(url).searchParams.get("key").replace(/^eq\./, "");
      return Response.json(store.has(key) ? [{ text: store.get(key).text }] : []);
    }
    calls.push("groq");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
  };

  const first = await (await POST(request())).json();
  assert.equal(first.source, "groq");
  assert.deepEqual(calls, ["supabase GET", "groq", "supabase POST"]);
  assert.deepEqual([...store.values()].map(row => [row.kind, row.text]), [["dev-filter-intro", safe]]);

  calls.length = 0;
  const second = await (await POST(request())).json();
  assert.deepEqual(calls, ["supabase GET"]);
  assert.equal(second.cached, true);
  assert.deepEqual(second.summary, first.summary);

  // A cached entry that no longer passes verification is ignored and the model is asked again.
  for (const row of store.values()) row.text = `${safe} 999`;
  calls.length = 0;
  assert.equal((await (await POST(request())).json()).summary.introduction, safe);
  assert.deepEqual(calls, ["supabase GET", "groq", "supabase POST"]);
});
