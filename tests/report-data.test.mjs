import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/report.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildReport, filterTasks } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
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
