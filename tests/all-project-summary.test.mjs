import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(transpile(source)).toString("base64")}`;
const helperUrl = moduleUrl(await readFile(new URL("../app/lib/all-project-summary.ts", import.meta.url), "utf8"));
const {
  ALL_PROJECT_SUMMARY_INTRO,
  buildAllProjectSummary,
  parseAllProjectSummary,
  parseAllProjectSummaryInput,
  verifiedAllProjectIntroduction,
} = await import(helperUrl);
const routeSource = await readFile(new URL("../app/api/summarize/dev/all-project/route.ts", import.meta.url), "utf8");
const { POST } = await import(moduleUrl(routeSource.replace('"../../../../lib/all-project-summary"', JSON.stringify(helperUrl))));

const input = {
  period: "Sprint 41–42 дугаар спринтийн",
  totalProjects: 3,
  doneEstimateMinutes: 8_675,
  statuses: { todo: 0, inProgress: 1, qa: 0, hold: 0, done: 2 },
  partial: false,
};

test("All Project summary accepts only internally consistent root-project facts", () => {
  assert.deepEqual(parseAllProjectSummaryInput(input), input);
  assert.equal(parseAllProjectSummaryInput({ ...input, totalProjects: 4 }), null);
  assert.equal(parseAllProjectSummaryInput({ ...input, doneEstimateMinutes: -1 }), null);
  assert.equal(parseAllProjectSummaryInput({ ...input, statuses: { ...input.statuses, done: 3 } }), null);
  assert.equal(parseAllProjectSummaryInput({ ...input, period: "" }), null);
});

test("Groq wording cannot add figures, causes, forecasts or omit ClickUp projects", () => {
  const safe = "Сонгосон ClickUp шүүлтүүрийн үндсэн төслүүдийн гүйцэтгэл болон төлөвийн мэдээллийг мэргэжлийн хэлбэрээр нэгтгэн харуулав.";
  assert.equal(verifiedAllProjectIntroduction(safe), safe);
  for (const candidate of [
    `${safe} 67 хувь`,
    `${safe} Үүний шалтгаан нь ачаалал.`,
    "Үндсэн төслүүдийн гүйцэтгэл болон төлөвийн мэдээллийг мэргэжлийн хэлбэрээр нэгтгэн харуулав.",
    "Сонгосон ClickUp ажлын гүйцэтгэл болон төлөвийн мэдээллийг мэргэжлийн хэлбэрээр нэгтгэн харуулав.",
  ]) assert.equal(verifiedAllProjectIntroduction(candidate), ALL_PROJECT_SUMMARY_INTRO);
});

test("All Project summary response preserves the exact server-validated facts", () => {
  const summary = buildAllProjectSummary(input);
  assert.deepEqual(summary.facts, input);
  assert.deepEqual(parseAllProjectSummary(summary), summary);
  assert.equal(parseAllProjectSummary({ ...summary, facts: { ...summary.facts, totalProjects: 99 } }), null);
});

test("All Project summary API uses Groq safely and falls back locally", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFastModel = process.env.GROQ_FAST_MODEL;
  const originalFetch = globalThis.fetch;
  const request = payload => new Request("http://localhost/api/summarize/dev/all-project", { method: "POST", body: JSON.stringify(payload) });
  try {
    delete process.env.GROQ_API_KEY;
    assert.equal((await POST(request({}))).status, 400);
    const local = await (await POST(request(input))).json();
    assert.equal(local.source, "local");
    assert.deepEqual(local.summary, buildAllProjectSummary(input));

    process.env.GROQ_API_KEY = "test-key-not-a-secret";
    delete process.env.GROQ_FAST_MODEL;
    const safe = "Сонгосон ClickUp шүүлтүүрийн үндсэн төслүүдийн гүйцэтгэл болон төлөвийн мэдээллийг мэргэжлийн хэлбэрээр нэгтгэн харуулав.";
    let requestBody;
    globalThis.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
    };
    const groq = await (await POST(request(input))).json();
    assert.equal(groq.source, "groq");
    assert.equal(groq.summary.introduction, safe);
    assert.deepEqual(groq.summary.facts, input);
    assert.match(requestBody.messages[0].content, /In Progress, Done/);
    assert.doesNotMatch(requestBody.messages[0].content, /"totalProjects"/);

    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: `${safe} 999` }) } }] });
    const rejected = await (await POST(request(input))).json();
    assert.equal(rejected.source, "local");
    assert.equal(rejected.summary.introduction, ALL_PROJECT_SUMMARY_INTRO);

    process.env.GROQ_MODEL = "retired-model";
    const models = [];
    globalThis.fetch = async (_url, options) => {
      const model = JSON.parse(options.body).model;
      models.push(model);
      return model === "retired-model" ? new Response("Not found", { status: 404 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ introduction: safe }) } }] });
    };
    assert.equal((await (await POST(request(input))).json()).source, "groq");
    assert.deepEqual(models, ["retired-model", "openai/gpt-oss-20b"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = originalModel;
    if (originalFastModel === undefined) delete process.env.GROQ_FAST_MODEL; else process.env.GROQ_FAST_MODEL = originalFastModel;
  }
});
