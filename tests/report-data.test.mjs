import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/report.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildReport, filterTasks } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const devSource = await readFile(new URL("../app/lib/dev-report.ts", import.meta.url), "utf8");
const { outputText: devOutputText } = ts.transpileModule(devSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildSprintPeriods, DEV_PROJECT_STATUSES, devProjectStatus, filterDevTasksByMonthKeys, formatSprintDateRange, groupDevProjectTasks, memberProductivity, memberTaskDistribution, metricPercentChange, monthlyTaskPerformance, nextDevProjectSort, previousSprintPeriods, selectDevAllProjectList, selectDevTasks, teamCompletionAverage, topLevelDevTasks } = await import(`data:text/javascript;base64,${Buffer.from(devOutputText).toString("base64")}`);
async function importTypescriptLibrary(path) {
  const librarySource = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText: libraryOutput } = ts.transpileModule(librarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(libraryOutput).toString("base64")}`);
}
const { mergeSprintMemberships } = await importTypescriptLibrary("../app/lib/clickup-sprint-sync.ts");
const { requestClickUp, clickUpRetryDelay } = await importTypescriptLibrary("../app/lib/clickup-request.ts");
const data = {
  list: { id: "list", name: "Team" }, reportYear: 2026, syncedAt: "2026-08-27T00:00:00Z", partial: false,
  people: [{ id: "person", name: "Ажилтан", parentIds: ["parent"] }],
  parents: [{ id: "parent", name: "Daily Task", assignees: [] }],
  subtasks: Array.from({ length: 105 }, (_, i) => ({
    id: `task-${i}`, parentId: i === 104 ? "other" : "parent", parentName: "Daily Task",
    assignment: [{ id: 7, name: "Ажилтан" }], status: { name: "complete", type: "closed" },
    type: i % 2 ? { name: "Support" } : null,
    dueDate: i === 104 ? null : String(Date.UTC(2026, i < 50 ? 0 : 6, 15)),
    timeEstimate: i === 104 ? null : 60_000,
  })),
};

test("full export includes all rows, including records beyond the visible page and ungrouped parents", () => {
  const report = buildReport(data);
  assert.equal(report.tasks.length, 105);
  assert.ok(report.tasks.some(task => task.id === "task-104"));
  assert.equal(report.ungrouped.tasks, 1);
  assert.equal(report.people[0].tasks, 104);
  assert.equal(report.totals.estimateMs, 104 * 60_000);
  assert.equal(report.totals.estimatedTasks, 104);
  assert.equal(report.totals.averageMinutes, 1);
  assert.equal(report.monthly.reduce((sum, month) => sum + month.tasks, 0), 104);
  assert.equal(report.halves[0].tasks, 50);
  assert.equal(report.halves[1].tasks, 54);
  assert.equal(report.categories.reduce((sum, category) => sum + category.tasks, 0), 105);
});

test("exports apply the same intersecting employee, month, type, and search filters as the task table", () => {
  assert.equal(filterTasks(data, { person: "person", month: "01", type: "Support" }).length, 25);
  assert.equal(filterTasks(data, { search: "TASK-104" }).length, 1);
  assert.equal(filterTasks(data, { search: "АЖИЛТАН" }).length, 105);
  assert.equal(filterTasks(data, { person: "person", search: "task-104" }).length, 0);
  assert.equal(filterTasks(data, { type: "Тодорхойгүй" }).length, 53);
});

test("empty and invalid-date exports have finite totals and flag missing fields", () => {
  const empty = buildReport(data, { search: "no-such-task" });
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.totals.averageMinutes, 0);
  const report = buildReport({ ...data, subtasks: [{ ...data.subtasks[0], dueDate: "invalid", timeEstimate: null }] });
  assert.equal(report.totals.tasks, 1);
  assert.equal(report.monthly.reduce((sum, month) => sum + month.tasks, 0), 0);
  assert.equal(report.quality.find(item => item.name === "Due date оруулаагүй").count, 1);
});

test("Dev period multi-select keeps exact year-month connections", () => {
  const devTasks = [
    { id: "jan-2025", dueDate: "2025-01-10", closedDate: null, startDate: null, createdDate: null, type: "Bug" },
    { id: "jun-2025", dueDate: "2025-06-10", closedDate: null, startDate: null, createdDate: null, type: "Imp" },
    { id: "jan-2026", dueDate: "2026-01-10", closedDate: null, startDate: null, createdDate: null, type: "Bug" },
    { id: "jun-2026", dueDate: "2026-06-10", closedDate: null, startDate: null, createdDate: null, type: "Imp" },
  ];
  const selectedKeys = ["2025-01", "2026-06"];
  const selected = filterDevTasksByMonthKeys(devTasks, selectedKeys);
  assert.deepEqual(selected.map(task => task.id), ["jan-2025", "jun-2026"]);
  assert.deepEqual(monthlyTaskPerformance(selected, "2025-01-01", "2026-12-31", selectedKeys).map(month => month.key), selectedKeys);
});

test("Dev counts each parent task once and never counts its subtasks", () => {
  const tasks = [
    { id: "parent-one", parentId: null },
    { id: "child-one", parentId: "parent-one" },
    { id: "child-two", parentId: "parent-one" },
    { id: "parent-two", parentId: null },
    { id: "child-three", parentId: "parent-two" },
  ];
  assert.deepEqual(topLevelDevTasks(tasks).map(task => task.id), ["parent-one", "parent-two"]);
});

test("productivity pie shares use the exact Total Tasks column, including multiple assignees", () => {
  const person = (id, name) => ({ id, name, avatar: null, color: "" });
  const tasks = [
    { id: "shared", assignees: [person("one", "One"), person("two", "Two")], status: { done: true }, timeEstimateMs: 60_000, position: "Development" },
    { id: "only-one", assignees: [person("one", "One")], status: { done: false }, timeEstimateMs: 120_000, position: "Development" },
  ];
  const team = memberProductivity(tasks);
  const distribution = memberTaskDistribution(team);
  assert.equal(distribution.total, 3);
  assert.deepEqual(distribution.members.map(member => member.totalTasks), [2, 1]);
  assert.deepEqual(distribution.members.map(member => member.doneTasks), [1, 1]);
  assert.equal(distribution.members[0].completion, 50);
  assert.ok(Math.abs(distribution.members.reduce((sum, member) => sum + member.share, 0) - 100) < 1e-9);
  assert.deepEqual(memberTaskDistribution([{ ...team[0], totalTasks: 0 }]).members.map(member => member.share), [0]);
  assert.deepEqual(memberTaskDistribution([]), { total: 0, members: [] });
  assert.equal(memberTaskDistribution([team[0]]).members[0].share, 100);
});

test("All Project assigns every ClickUp task to one of the five requested status lanes", () => {
  const task = (id, name, type, done = false, parentName = "Store.mn | Development") => ({
    id, name: id, project: "", parentName, status: { name, type, done }, updatedAt: null,
    dueDate: "2026-01-01", closedDate: null, startDate: null, createdDate: null,
  });
  const tasks = [
    task("todo", "to do", "open"),
    task("other-open", "improvements", "open"),
    task("progress", "in progress", "custom"),
    task("qa", "qa test", "done"),
    task("deploy", "need to deploy", "done"),
    task("hold", "hold", "unstarted"),
    task("complete", "complete", "closed", true),
    task("review", "review", "done"),
  ];
  assert.deepEqual(tasks.map(devProjectStatus), ["todo", "todo", "inProgress", "qa", "qa", "hold", "done", "qa"]);
  const [project] = groupDevProjectTasks(tasks);
  assert.equal(project.name, "Store.mn");
  assert.equal(project.tasks.length, tasks.length);
  assert.equal(Object.values(project.statuses).reduce((sum, count) => sum + count, 0), tasks.length);
  assert.deepEqual(Object.keys(project.statuses), DEV_PROJECT_STATUSES.map(status => status.key));
});

test("All Project source selects the named ClickUp list and never falls back to Master", () => {
  const lists = [
    { id: "master", name: "Master list - B2C", space: "Dev", folder: "B2C" },
    { id: "sprint", name: "Sprint 53", space: "Dev", folder: "B2C Sprints" },
    { id: "projects", name: "All Projects", space: "Dev", folder: "Project" },
  ];
  assert.equal(selectDevAllProjectList(lists)?.id, "projects");
  assert.equal(selectDevAllProjectList(lists.slice(0, 2)), null);
});

test("New Project Plan uses only top-level To do tasks from the All Projects source", () => {
  const task = (id, status, parentId = null) => ({ id, parentId, status: { name: status, type: "open", done: false } });
  const allProjectTasks = [task("new-project", "to do"), task("new-project-child", "to do", "new-project"), task("active-project", "in progress")];
  const planningTasks = topLevelDevTasks(allProjectTasks).filter(item => devProjectStatus(item) === "todo");
  assert.deepEqual(planningTasks.map(item => item.id), ["new-project"]);
});

test("multiple sprint choices use a unique union and do not use task dates as membership", () => {
  const tasks = [
    { id: "one", dueDate: "2025-01-01", sprintIds: ["s1"] },
    { id: "shared", dueDate: "2026-02-01", sprintIds: ["s1", "s2"] },
    { id: "two", dueDate: "2026-03-01", sprintIds: ["s2"] },
    { id: "other", dueDate: "2026-03-01", sprintIds: ["s3"] },
  ].map(task => ({ ...task, type: "Bug", name: task.id, parentName: "", project: "", sprint: "", status: { name: "complete" }, assignees: [], customFields: {} }));
  const selected = selectDevTasks({ tasks }, { search: "", startDate: "2026-03-01", endDate: "2026-03-31", taskType: "all", sprintIds: ["s1", "s2"] });
  assert.deepEqual(selected.map(task => task.id), ["one", "shared", "two"]);
});

test("Sprint card dates use each list's dates and keep cross-year ranges unambiguous", () => {
  assert.equal(formatSprintDateRange("2026-07-27", "2026-08-09"), "7/27 - 8/9");
  assert.equal(formatSprintDateRange("2026-07-13", "2026-07-26"), "7/13 - 7/26");
  assert.equal(formatSprintDateRange("2025-12-29", "2026-01-11"), "2025/12/29 - 2026/1/11");
  assert.equal(formatSprintDateRange(null, "2026-08-09"), "— - 8/9");
  assert.equal(formatSprintDateRange(null, null), "Огноо тодорхойгүй");
});

const sprintList = (number, id = `s${number}`, extra = {}) => ({ id, name: `Sprint ${number}`, folder: "B2C Sprint List", startDate: "2026-01-01", endDate: "2026-01-14", taskCount: 0, ...extra });

test("segments start at 11–12, retain duplicate list IDs, and flag incomplete pairs", () => {
  const periods = buildSprintPeriods([sprintList(10), sprintList(11), sprintList(12), sprintList(13), sprintList(14), sprintList(31), sprintList(32, "32a"), sprintList(32, "32b"), sprintList(53)], "segment");
  assert.deepEqual(periods.map(period => period.label), ["Sprint 53–54", "Sprint 31–32", "Sprint 13–14", "Sprint 11–12"]);
  assert.deepEqual(periods[1].sprintIds, ["s31", "32a", "32b"]);
  assert.equal(periods[1].complete, true);
  assert.equal(periods[0].complete, false);
  assert.deepEqual(periods[0].missingNumbers, [54]);
  assert.equal(periods[0].endDate, null);
  const singles = buildSprintPeriods([sprintList(32, "32a"), sprintList(32, "32b")], "sprint");
  assert.equal(singles.length, 1);
  assert.deepEqual(singles[0].sprintIds, ["32a", "32b"]);
});

test("segment dates come from the boundary sprints, not an inner sprint with missing dates", () => {
  const [period] = buildSprintPeriods([sprintList(11, "s11", { startDate: "2024-12-30", endDate: "2025-01-12" }), sprintList(12, "s12", { startDate: "2025-01-13", endDate: "2025-01-26" })], "segment");
  assert.equal(period.startDate, "2024-12-30");
  assert.equal(period.endDate, "2025-01-26");
  const [missingEnd] = buildSprintPeriods([sprintList(11), sprintList(12, "s12", { endDate: null })], "segment");
  assert.equal(missingEnd.endDate, null);
});

test("Sprint 11–12 and Sprint 13–14 options select exact list-ID unions without duplicate tasks", () => {
  const lists = [sprintList(11), sprintList(12), sprintList(13), sprintList(14)];
  const periods = buildSprintPeriods(lists, "segment");
  const task = (id, sprintIds) => ({ id, sprintIds, dueDate: "2026-06-01", type: "Bug", name: id, parentName: "", project: "", sprint: "", status: { name: "done" }, assignees: [], tags: [], customFields: {} });
  const tasks = [task("eleven", ["s11"]), task("twelve", ["s12"]), task("shared", ["s11", "s12"]), task("thirteen", ["s13"]), task("fourteen", ["s14"]), task("outside", ["s15"])];
  const filters = { search: "", taskType: "all", startDate: "2025-01-01", endDate: "2025-01-31", sprintIds: [] };
  const first = periods.find(period => period.id === "segment-11");
  const second = periods.find(period => period.id === "segment-13");
  assert.equal(first.label, "Sprint 11–12");
  assert.equal(second.label, "Sprint 13–14");
  assert.deepEqual(selectDevTasks({ tasks }, { ...filters, sprintIds: first.sprintIds }).map(task => task.id), ["eleven", "twelve", "shared"]);
  assert.deepEqual(selectDevTasks({ tasks }, { ...filters, sprintIds: second.sprintIds }).map(task => task.id), ["thirteen", "fourteen"]);
  assert.deepEqual(selectDevTasks({ tasks }, { ...filters, sprintIds: [...first.sprintIds, ...second.sprintIds] }).map(task => task.id), ["eleven", "twelve", "shared", "thirteen", "fourteen"]);
});

test("single and multiple period comparisons use equally sized, non-overlapping previous blocks", () => {
  const lists = Array.from({ length: 12 }, (_, index) => sprintList(11 + index));
  const segments = buildSprintPeriods(lists, "segment");
  assert.deepEqual(previousSprintPeriods(segments, ["segment-15"]).periods.map(period => period.id), ["segment-13"]);
  const multi = previousSprintPeriods(segments, ["segment-19", "segment-21"]);
  assert.equal(multi.available, true);
  assert.deepEqual(multi.periods.map(period => period.id), ["segment-17", "segment-15"]);
  const nonSequential = previousSprintPeriods(segments, ["segment-21", "segment-15"]);
  assert.equal(nonSequential.available, true);
  assert.deepEqual(nonSequential.periods.map(period => period.id), ["segment-19", "segment-13"]);
  const singles = buildSprintPeriods(lists, "sprint");
  assert.deepEqual(previousSprintPeriods(singles, ["sprint-15"]).periods.map(period => period.id), ["sprint-14"]);
  assert.deepEqual(previousSprintPeriods(singles, ["sprint-15", "sprint-16"]).periods.map(period => period.id), ["sprint-14", "sprint-13"]);
});

test("missing or partial prior periods never silently skip to an older baseline", () => {
  const missing = buildSprintPeriods([sprintList(11), sprintList(12), sprintList(15), sprintList(16)], "segment");
  assert.equal(previousSprintPeriods(missing, ["segment-15"]).available, false);
  assert.equal(previousSprintPeriods(missing, ["segment-11"]).available, false);
  const partial = buildSprintPeriods([sprintList(13, "s13", { partial: true }), sprintList(14), sprintList(15), sprintList(16)], "segment");
  assert.equal(previousSprintPeriods(partial, ["segment-15"]).available, false);
  assert.equal(previousSprintPeriods(partial, ["segment-13"]).available, false);
  assert.equal(previousSprintPeriods(partial, ["segment-unknown"]).available, false);
});

test("team completion is an unweighted five-person average, with zero-task people at zero", () => {
  const names = ["Ariunbileg Garam-Ayush", "Ulziibayar S", "maralmaa", "Erdenejargal", "Yesugen"];
  const assigned = (name, done) => ({ assignees: [{ name }], status: { done } });
  const tasks = [assigned(names[0], true), ...Array.from({ length: 9 }, () => assigned(names[0], false)), assigned(names[1], true), assigned(names[2], true), assigned(names[3], false)];
  const result = teamCompletionAverage(tasks);
  assert.equal(result.members.length, 5);
  assert.equal(result.average, 42); // (10 + 100 + 100 + 0 + 0) / 5, not 3 / 13.
  assert.equal(result.members[4].totalTasks, 0);
  assert.equal(teamCompletionAverage([]).average, 0);
  const shared = teamCompletionAverage([{ assignees: [{ name: names[0] }, { name: names[1] }, { name: names[1] }], status: { done: true } }]);
  assert.equal(shared.average, 40);
  assert.equal(shared.members[1].totalTasks, 1);
});

test("metric comparisons handle increases, decreases, and zero baselines without Infinity", () => {
  assert.equal(metricPercentChange(109, 197).toFixed(1), "-44.7");
  assert.equal(metricPercentChange(64, 45).toFixed(1), "42.2");
  assert.equal(metricPercentChange(0, 20), -100);
  assert.equal(metricPercentChange(20, 0), null);
  assert.equal(metricPercentChange(0, 0), 0);
});

test("All Project columns cycle through first order, reverse order, and default", () => {
  let updated = nextDevProjectSort(null, "updated");
  assert.deepEqual(updated, { key: "updated", direction: "desc" });
  updated = nextDevProjectSort(updated, "updated");
  assert.deepEqual(updated, { key: "updated", direction: "asc" });
  assert.equal(nextDevProjectSort(updated, "updated"), null);

  let project = nextDevProjectSort(null, "project");
  assert.deepEqual(project, { key: "project", direction: "asc" });
  project = nextDevProjectSort(project, "project");
  assert.deepEqual(project, { key: "project", direction: "desc" });
  assert.equal(nextDevProjectSort(project, "project"), null);

  assert.deepEqual(nextDevProjectSort({ key: "tasks", direction: "asc" }, "completion"), { key: "completion", direction: "desc" });
});

test("current and previous sprint cohorts keep the same search/type filters but ignore task-date boundaries", () => {
  const task = (id, sprintIds, type, name) => ({ id, sprintIds, type, name, dueDate: "2025-01-01", parentName: "", project: "", sprint: "", status: { name: "done", done: true }, assignees: [], tags: [], customFields: {} });
  const tasks = [task("current", ["s15", "s16"], "Bug", "checkout"), task("prior", ["s13"], "Bug", "checkout"), task("wrong-type", ["s14"], "Imp", "checkout"), task("wrong-search", ["s14"], "Bug", "catalog")];
  const filters = { search: "checkout", taskType: "Bug", startDate: "2026-06-01", endDate: "2026-06-30", sprintIds: ["s15", "s16"] };
  assert.deepEqual(selectDevTasks({ tasks }, filters).map(task => task.id), ["current"]);
  assert.deepEqual(selectDevTasks({ tasks }, { ...filters, sprintIds: ["s13", "s14"] }).map(task => task.id), ["prior"]);
});

test("failed or partial sprint responses preserve links; complete responses are authoritative", () => {
  const sprint = { id: "s1", name: "Sprint 1", folder: "B2C Sprint List", startDate: null, endDate: null, taskCount: 1 };
  const tasks = [{ id: "old", sprintIds: ["s1"] }, { id: "new", sprintIds: [] }];
  const partial = mergeSprintMemberships(tasks, [sprint], [{ sprint, taskIds: ["new", "unrelated", "new"], failed: false, partial: true }]);
  assert.equal(partial.sprints[0].taskCount, 2);
  assert.deepEqual(partial.tasks.map(task => task.sprintIds), [["s1"], ["s1"]]);
  const failed = mergeSprintMemberships(partial.tasks, partial.sprints, [{ sprint, taskIds: [], failed: true, partial: true }]);
  assert.equal(failed.sprints[0].taskCount, 2);
  const complete = mergeSprintMemberships(failed.tasks, failed.sprints, [{ sprint, taskIds: ["new"], failed: false, partial: false }]);
  assert.deepEqual(complete.tasks.map(task => task.sprintIds), [[], ["s1"]]);
  const empty = mergeSprintMemberships(complete.tasks, complete.sprints, [{ sprint, taskIds: [], failed: false, partial: false }]);
  assert.equal(empty.sprints.length, 1);
  assert.equal(empty.sprints[0].taskCount, 0);
});

test("ClickUp 429 waits for the documented reset header and retries", async () => {
  const now = Date.now();
  const limited = new Response("limited", { status: 429, headers: { "X-RateLimit-Reset": String(Math.ceil(now / 1000) + 5) } });
  assert.ok(clickUpRetryDelay(limited, 0, now) >= 5000);
  let calls = 0;
  const waits = [];
  const response = await requestClickUp("/list/test/task", "test-token", async () => ++calls === 1 ? limited : Response.json({ tasks: [] }), async milliseconds => { waits.push(milliseconds); });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(waits.length, 1);
});
