import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function library(name) {
  const source = await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { mapWithConcurrency, shareInFlightResponse } = await library("clickup-pagination");
const { requestClickUp } = await library("clickup-request");
const { CLICKUP_FULL_SYNC_INTERVAL_MS, mergeCxDelta, reportMonthWindows, shouldRunCxDeltaSync } = await library("clickup-cx-sync");

const due = (month, day) => String(Date.UTC(2026, month, day));
const mapParent = task => ({ id: task.id, name: task.name, assignees: [] });
const mapSubtask = (task, parent) => ({ id: task.id, name: task.name, parentId: parent.id, parentName: parent.name });

test("monthly windows cover the whole report year without gaps", () => {
  const windows = reportMonthWindows(2026);
  assert.equal(windows.length, 12);
  assert.equal(windows[0].start, Date.UTC(2026, 0, 1));
  assert.equal(windows.at(-1).end, Date.UTC(2027, 0, 1));
  for (let index = 1; index < windows.length; index += 1) assert.equal(windows[index].start, windows[index - 1].end);
});

test("concurrency helper caps in-flight work and keeps result order", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, delay));
    active -= 1;
    return index;
  });
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
  assert.equal(peak, 2);
});

test("identical concurrent syncs share one run and each caller gets a readable body", async () => {
  let runs = 0;
  let release;
  const run = () => { runs += 1; return new Promise(resolve => { release = () => resolve(Response.json({ ok: true })); }); };
  const first = shareInFlightResponse("same", run);
  const second = shareInFlightResponse("same", run);
  release();
  const bodies = await Promise.all([first, second].map(async response => (await response).json()));
  assert.equal(runs, 1);
  assert.deepEqual(bodies, [{ ok: true }, { ok: true }]);
  await (await shareInFlightResponse("same", async () => { runs += 1; return Response.json({}); })).json();
  assert.equal(runs, 2);
});

test("ClickUp requests honour a custom timeout and attempt count", async () => {
  const calls = [];
  const fetcher = async (_url, init) => { calls.push(init.signal); throw new DOMException("timed out", "TimeoutError"); };
  await assert.rejects(requestClickUp("/x", "token", fetcher, async () => {}, { timeoutMs: 50_000, attempts: 2 }), /timed out/);
  assert.equal(calls.length, 2);
});

test("delta sync adds, updates, reopens and re-parents CX tasks correctly", () => {
  const parents = [{ id: "p1", name: "Daily 1", assignees: [] }, { id: "p2", name: "Daily 2", assignees: [] }];
  const subtasks = [
    { id: "s1", name: "done", parentId: "p1", parentName: "Daily 1" },
    { id: "s2", name: "will reopen", parentId: "p1", parentName: "Daily 1" },
    { id: "s3", name: "parent leaves daily", parentId: "p2", parentName: "Daily 2" },
  ];
  const delta = [
    { id: "p1", name: "Daily 1 renamed", status: { status: "Daily Task" } },
    { id: "p2", name: "Daily 2", status: { status: "archived" } },
    { id: "p3", name: "Daily 3", status: { status: "daily task" } },
    { id: "s2", name: "reopened", parent: "p1", status: { status: "in progress" }, due_date: due(3, 2) },
    { id: "s4", name: "new", parent: "p3", status: { status: "complete" }, due_date: due(9, 15) },
    { id: "s5", name: "last year", parent: "p3", status: { status: "complete" }, due_date: String(Date.UTC(2025, 11, 31)) },
    { id: "s6", name: "orphan", parent: "unknown", status: { status: "complete" }, due_date: due(9, 15) },
  ];
  const merged = mergeCxDelta(parents, subtasks, delta, { year: 2026, mapParent, mapSubtask });
  assert.deepEqual(merged.parents.map(parent => [parent.id, parent.name]), [["p1", "Daily 1 renamed"], ["p3", "Daily 3"]]);
  assert.deepEqual(merged.subtasks.map(task => task.id).sort(), ["s1", "s4"]);
});

test("delta sync runs only after a recent full sync of a complete snapshot", () => {
  const now = Date.parse("2026-10-16T04:00:00Z");
  const snapshot = { parents: [], subtasks: [], syncedAt: "2026-10-16T03:50:00Z", fullSyncedAt: "2026-10-16T01:00:00Z" };
  assert.equal(shouldRunCxDeltaSync(snapshot, now), true);
  assert.equal(shouldRunCxDeltaSync({ ...snapshot, fullSyncedAt: undefined }, now), false);
  assert.equal(shouldRunCxDeltaSync({ ...snapshot, fullSyncedAt: new Date(now - CLICKUP_FULL_SYNC_INTERVAL_MS).toISOString() }, now), false);
  assert.equal(shouldRunCxDeltaSync(null, now), false);
});

test("requests pause before the rate-limit budget runs out instead of triggering 429s", async () => {
  const { noteClickUpRateLimit, clickUpRateLimitWait } = await library("clickup-request");
  const now = Date.now();
  noteClickUpRateLimit(new Response("{}", { headers: { "X-RateLimit-Remaining": "40", "X-RateLimit-Reset": String(Math.ceil(now / 1000) + 30) } }), now);
  assert.equal(clickUpRateLimitWait(now), 0);
  noteClickUpRateLimit(new Response("{}"), now);
  assert.equal(clickUpRateLimitWait(now), 0);
  noteClickUpRateLimit(new Response("{}", { headers: { "X-RateLimit-Remaining": "2", "X-RateLimit-Reset": String(Math.ceil(now / 1000) + 30) } }), now);
  assert.ok(clickUpRateLimitWait(now) >= 29_000);
});
