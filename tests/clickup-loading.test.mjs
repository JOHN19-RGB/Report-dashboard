import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function library(name) {
  const source = await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { readClickUpTaskPages, mergeClickUpTaskSnapshot } = await library("clickup-pagination");
const { createClickUpReportLoader, needsClickUpSprintRefresh } = await library("clickup-report-loader");
const now = Date.parse("2026-09-22T03:00:00Z");
const fresh = { syncedAt: new Date(now).toISOString(), tasks: [{ id: "new" }] };
const stale = { syncedAt: "2026-08-27T00:00:00Z", tasks: [{ id: "old" }] };
const validate = value => Boolean(value?.syncedAt && Array.isArray(value.tasks));
const options = onData => ({ refreshPath: "/report?refresh=1", validate, onData });

test("pagination continues past short pages and deduplicates tasks without losing later pages", async () => {
  const pages = [
    { tasks: [{ id: "one" }], last_page: false },
    { tasks: [{ id: "one", updated: true }, { id: "two" }], last_page: false },
    { tasks: [{ id: "three" }], last_page: true },
  ];
  const result = await readClickUpTaskPages(async page => pages[page] || { tasks: [] });
  assert.deepEqual(result.tasks, [{ id: "one", updated: true }, { id: "two" }, { id: "three" }]);
  assert.equal(result.partial, false);
  assert.equal(result.pagesRead, 3);
});

test("pagination retrieves complete multi-page lists beyond 1,000 records", async () => {
  const result = await readClickUpTaskPages(async page => ({
    tasks: Array.from({ length: page === 12 ? 3 : 100 }, (_, i) => ({ id: `${page}-${i}` })),
    last_page: page === 12,
  }));
  assert.equal(result.tasks.length, 1203);
  assert.equal(result.partial, false);
});

test("pagination respects the limit, flags truncation, and preserves unseen snapshot tasks", async () => {
  const requested = [];
  const result = await readClickUpTaskPages(async page => {
    requested.push(page);
    return { tasks: [{ id: String(page), updated: true }], last_page: false };
  }, { pageLimit: 3, batchSize: 2 });
  assert.deepEqual(requested, [0, 1, 2]);
  assert.equal(result.partial, true);
  const previous = [{ id: "older" }, { id: "0", updated: false }];
  const combined = mergeClickUpTaskSnapshot(previous, result.tasks, result.partial);
  assert.equal(combined.length, 4);
  assert.equal(combined.find(task => task.id === "0").updated, true);
  assert.deepEqual(mergeClickUpTaskSnapshot(previous, result.tasks, false), result.tasks);
});

test("malformed pages and required-page failures cannot masquerade as complete reports", async () => {
  await assert.rejects(readClickUpTaskPages(async () => ({})), /tasks array/);
  await assert.rejects(readClickUpTaskPages(async page => {
    if (page === 1) throw new Error("failed page");
    return { tasks: [{ id: "one" }], last_page: false };
  }), /failed page/);
  const result = await readClickUpTaskPages(async page => {
    if (page === 1) throw new Error("unneeded speculative page");
    return { tasks: [{ id: "one" }], last_page: true };
  });
  assert.equal(result.partial, false);
});

test("cached data is delivered before a slow refresh finishes", async () => {
  let finishRefresh;
  const seen = [];
  const loader = createClickUpReportLoader(async url => {
    if (url === "/report") return Response.json(stale);
    assert.deepEqual(seen.at(-1), stale);
    return new Promise(resolve => { finishRefresh = () => resolve(Response.json(fresh)); });
  }, () => now);
  const loading = loader.load("/report", options(data => seen.push(data)));
  while (!finishRefresh) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [stale]);
  finishRefresh();
  await loading;
  assert.deepEqual(seen, [stale, fresh]);
});

test("simultaneous consumers share requests and navigation reuses the last result immediately", async () => {
  const calls = [];
  const loader = createClickUpReportLoader(async url => { calls.push(url); return Response.json(fresh); }, () => now);
  await Promise.all([loader.load("/report", options(() => {})), loader.load("/report", options(() => {}))]);
  assert.deepEqual(calls, ["/report"]);
  const seen = [];
  const navigation = loader.load("/report", options(data => seen.push(data)));
  assert.deepEqual(seen, [fresh]);
  await navigation;
  assert.deepEqual(calls, ["/report", "/report"]);
});

test("refresh errors preserve displayed snapshots and do not poison the retry", async () => {
  let fail = true;
  const seen = [];
  const loader = createClickUpReportLoader(async url => url === "/report" ? Response.json(stale) : fail ? Response.json({ error: "offline" }, { status: 502 }) : Response.json(fresh), () => now);
  await assert.rejects(loader.load("/report", options(data => seen.push(data))), /offline/);
  assert.deepEqual(seen, [stale]);
  fail = false;
  const result = await loader.load("/report", { ...options(() => {}), refresh: true });
  assert.deepEqual(result, fresh);
});

test("a recent sprint sync cannot conceal stale tasks, and empty or incomplete sprints get repaired", async () => {
  const calls = [];
  const loader = createClickUpReportLoader(async url => {
    calls.push(url);
    return Response.json(url === "/report" ? { ...fresh, taskSyncedAt: stale.syncedAt } : fresh);
  }, () => now);
  await loader.load("/report", options(() => {}));
  assert.deepEqual(calls, ["/report", "/report?refresh=1"]);
  assert.equal(needsClickUpSprintRefresh({ ...fresh, sprints: [] }, now), true);
  assert.equal(needsClickUpSprintRefresh({ ...fresh, sprints: [{}], sprintNeedsFullRefresh: true }, now), true);
  assert.equal(needsClickUpSprintRefresh({ ...fresh, sprints: [{}], sprintSyncErrors: 1 }, now), true);
  assert.equal(needsClickUpSprintRefresh({ ...fresh, sprints: [{}], sprintSyncedAt: stale.syncedAt }, now), true);
  assert.equal(needsClickUpSprintRefresh({ ...fresh, sprints: [{}], sprintSyncedAt: fresh.syncedAt }, now), false);
});
