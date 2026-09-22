import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(transpile(source)).toString("base64")}`;
const helperUrl = moduleUrl(await readFile(new URL("../app/lib/team-comparison.ts", import.meta.url), "utf8"));
const { buildTeamComparison, comparisonTaskType, comparisonSummary, verifiedComparisonIntroduction, COMPARISON_INTRO } = await import(helperUrl);
const routeSource = await readFile(new URL("../app/api/summarize/comparison/route.ts", import.meta.url), "utf8");
const { POST } = await import(moduleUrl(routeSource.replace('"../../../lib/team-comparison"', JSON.stringify(helperUrl))));

const cxTask = (id, type, month = 4, extra = {}) => ({ id, dueDate: String(Date.UTC(2026, month, 10)), type: { name: type }, status: { name: "complete", type: "closed" }, ...extra });
const devTask = (id, type, date = "2026-05-10", extra = {}) => ({ id, dueDate: date, type, status: { done: true }, sprintIds: [], ...extra });
const cx = { reportYear: 2026, subtasks: [cxTask("bug", "Bug"), cxTask("bug", "Bug"), cxTask("functional", "Imp- Functional"), cxTask("performance", "Imp- Performance"), cxTask("not", "Not bug/Imp"), cxTask("april", "Bug", 3), cxTask("missing", "Bug", 4, { dueDate: null }), cxTask("invalid", "Bug", 4, { dueDate: "invalid" }), cxTask("open", "Bug", 4, { status: { name: "in progress", type: "custom" } })], syncedAt: "2026-09-18T00:00:00Z", partial: false };
const dev = { tasks: [devTask("imp", "Imp"), devTask("imp", "Imp"), devTask("not", "Not bug/imp"), devTask("bug", "Bug"), devTask("bug2", "Bug"), devTask("bug-subtask", "Bug", "2026-05-10", { parentId: "bug" }), devTask("open", "Bug", "2026-05-01", { status: { done: false } }), devTask("prev-year", "Bug", "2025-05-01"), devTask("missing", "Bug", null, { closedDate: "2026-05-01" })], syncedAt: "2026-09-18T01:00:00Z", taskPartial: false };

test("CX and Dev comparison matches exact year/month, completed status and canonical types, deduplicating IDs", () => {
  const facts = buildTeamComparison(cx, dev, "2026-05");
  assert.deepEqual(facts.cx, { bug: 1, imp: 2 });
  assert.deepEqual(facts.dev, { bug: 2, imp: 1 });
  assert.deepEqual(facts.difference, { bug: -1, imp: 1 });
  assert.equal(facts.partial, false);
  assert.equal(comparisonTaskType("Not bug/Imp"), null);
  assert.equal(comparisonTaskType(" Imp- Performance "), "imp");
  assert.equal(buildTeamComparison({ ...cx, partial: true }, dev, "2026-05").partial, true);
  assert.equal(buildTeamComparison(cx, { ...dev, taskPartial: true }, "2026-05").partial, true);
  assert.throws(() => buildTeamComparison(cx, dev, "2025-05"));
  assert.throws(() => buildTeamComparison(cx, dev, "2026-13"));
});

test("summary includes exact counts and explicitly avoids claiming reconciliation, internal classification or causes", () => {
  const facts = buildTeamComparison(cx, dev, "2026-05");
  const text = comparisonSummary(facts);
  assert.match(text, /2026 оны 5-р сарын дүгнэлт/);
  assert.match(text, /Bug task: 1\nIMP task: 2/);
  assert.match(text, /Bug task: 2\nIMP task: 1/);
  assert.match(text, /ижил task ID-аар хийсэн тулгалт биш/);
  assert.match(text, /Зөрүүний шалтгаан.*баталгаажаагүй/);
  assert.match(text, /сарын эцсийн архив биш/);
  assert.match(comparisonSummary({ ...facts, partial: true }), /эх өгөгдөл дутуу/);
  assert.doesNotMatch(comparisonSummary(buildTeamComparison({ ...cx, subtasks: [] }, { ...dev, tasks: [] }, "2026-05")), /NaN|Infinity/);
});

test("AI introduction cannot alter numeric facts or supply an unverified causal claim", () => {
  for (const text of [null, "", `${COMPARISON_INTRO} 123`, `${COMPARISON_INTRO} Зөрүүний шалтгаан нь бүртгэлийн алдаа.`, `${COMPARISON_INTRO} Үүнээс үүдэлтэй байна.`]) assert.equal(verifiedComparisonIntroduction(text), COMPARISON_INTRO);
  const safe = "CX болон Технологийн хөгжүүлэлтийн хэлтсийн гүйцэтгэсэн Bug, IMP таскуудын сарын бүртгэлийг харьцуулан нэгтгэв.";
  assert.equal(verifiedComparisonIntroduction(safe), safe);
});

test("summary API validates input, computes differences itself and falls back safely when Groq is unavailable", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  delete process.env.GROQ_API_KEY;
  const request = payload => new Request("http://localhost/api/summarize/comparison", { method: "POST", body: JSON.stringify(payload) });
  try {
    for (const payload of [null, {}, { monthKey: "2026-13", cx: { bug: 1, imp: 2 }, dev: { bug: 1, imp: 2 } }, { monthKey: "2026-05", cx: { bug: -1, imp: 2 }, dev: { bug: 1, imp: 2 } }]) assert.equal((await POST(request(payload))).status, 400);
    const facts = buildTeamComparison(cx, dev, "2026-05");
    const local = await (await POST(request({ ...facts, difference: { bug: 999, imp: 999 }, period: "fake" }))).json();
    assert.equal(local.source, "local");
    assert.equal(local.summary, comparisonSummary(facts));
    process.env.GROQ_API_KEY = "test-key-not-a-secret";
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    assert.equal((await (await POST(request(facts))).json()).source, "local");
    const safe = "CX болон Технологийн хөгжүүлэлтийн хэлтсийн гүйцэтгэсэн Bug, IMP таскуудын сарын бүртгэлийг харьцуулан нэгтгэв.";
    globalThis.fetch = async (url, options) => {
      assert.ok(JSON.parse(options.body).messages[0].content.includes(COMPARISON_INTRO));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
    };
    const result = await (await POST(request(facts))).json();
    assert.equal(result.source, "groq");
    assert.equal(result.summary, comparisonSummary(facts, safe));
    process.env.GROQ_MODEL = "retired-model";
    const requestedModels = [];
    globalThis.fetch = async (url, options) => {
      const model = JSON.parse(options.body).model;
      requestedModels.push(model);
      return model === "retired-model" ? new Response("Model not found", { status: 404 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: COMPARISON_INTRO }) } }] });
    };
    assert.equal((await (await POST(request(facts))).json()).source, "groq");
    assert.deepEqual(requestedModels, ["retired-model", "openai/gpt-oss-120b"]);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: `${safe} 9999` }) } }] });
    assert.equal((await (await POST(request(facts))).json()).summary, comparisonSummary(facts));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = originalModel;
  }
});
