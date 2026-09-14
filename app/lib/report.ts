export type Assignee = { id: number | null; name: string; color: string; avatar: string | null };
export type ReportTask = {
  id: string; name?: string; parentId: string; parentName: string;
  assignment: Assignee[];
  status: { name: string; color: string; type: string };
  type: { name: string; color: string } | null;
  dueDate: string | null; timeEstimate: number | null;
};
export type ReportPerson = {
  id: string; name: string; parentIds: string[];
  color?: string; avatar?: string | null;
  completeSubtasks: number; withType: number; withEstimate: number; estimateMs: number;
};
export type ReportData = {
  workspace?: { id: string; name: string; memberCount: number };
  list: { id: string; name: string }; reportYear: number;
  people: ReportPerson[];
  parents: { id: string; name: string; assignees: Assignee[]; completedCount: number; fetchedCount: number; fetched: boolean }[];
  subtasks: ReportTask[]; syncedAt: string; partial: boolean;
};
export type ReportFilters = { person?: string; month?: string; type?: string; search?: string };
export type Totals = { tasks: number; estimateMs: number; estimatedTasks: number; averageMinutes: number };
export const REPORT_COLORS = { navy: "17233D", teal: "168C80", coral: "FF6B4A", blue: "2676E8", ink: "17223A", muted: "64748B", pale: "F1F6F7", line: "DEE6EB", white: "FFFFFF" };
export const number = (value: number, digits = 0) => new Intl.NumberFormat("mn-MN", { maximumFractionDigits: digits }).format(value);
export function taskDate(value: string | null) {
  if (!value || !Number.isFinite(Number(value))) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
export const dateLabel = (value: string | null) => taskDate(value)?.toISOString().slice(0, 10) || "Оруулаагүй";
export const taskMonth = (task: ReportTask) => {
  const date = taskDate(task.dueDate);
  return date ? String(date.getUTCMonth() + 1).padStart(2, "0") : "";
};
export const hasEstimate = (task: ReportTask) => task.timeEstimate !== null && task.timeEstimate > 0;
export function totals(tasks: ReportTask[]): Totals {
  const estimateMs = tasks.reduce((sum, task) => sum + (task.timeEstimate || 0), 0);
  const estimatedTasks = tasks.filter(hasEstimate).length;
  return { tasks: tasks.length, estimateMs, estimatedTasks, averageMinutes: estimatedTasks ? estimateMs / 60_000 / estimatedTasks : 0 };
}
export function filterTasks(data: ReportData, filters: ReportFilters = {}) {
  const parents = new Set(data.people.find(person => person.id === filters.person)?.parentIds || []);
  const query = (filters.search || "").trim().toLocaleLowerCase("mn-MN");
  return data.subtasks.filter(task =>
    (!filters.person || filters.person === "all" || parents.has(task.parentId)) &&
    (!filters.month || filters.month === "all" || taskMonth(task) === filters.month) &&
    (!filters.type || filters.type === "all" || (task.type?.name || "Тодорхойгүй") === filters.type) &&
    (!query || [task.id, task.name, task.parentName, task.type?.name, ...task.assignment.map(person => person.name)].join(" ").toLocaleLowerCase("mn-MN").includes(query)),
  ).sort((a, b) => Number(b.dueDate || 0) - Number(a.dueDate || 0) || a.id.localeCompare(b.id));
}
export function filterLabel(data: ReportData, filters: ReportFilters) {
  return [
    filters.month && filters.month !== "all" ? `${Number(filters.month)}-р сар` : `${data.reportYear} он · Бүх сар`,
    filters.person && filters.person !== "all" ? data.people.find(p => p.id === filters.person)?.name : "Бүх ажилтан",
    filters.type && filters.type !== "all" ? filters.type : "",
    filters.search ? `Хайлт: ${filters.search}` : "",
  ].filter(Boolean).join(" · ");
}
export type ReportContext = { label: string; text: string };
export function buildReport(data: ReportData, filters: ReportFilters = {}, context?: ReportContext) {
  const tasks = filterTasks(data, filters);
  const monthly = Array.from({ length: 12 }, (_, index) => ({ name: `${index + 1}-р сар`, key: String(index + 1).padStart(2, "0"), ...totals(tasks.filter(task => Number(taskMonth(task)) === index + 1)) }));
  const categories = Array.from(new Set(tasks.map(task => task.type?.name || "Тодорхойгүй"))).map(name => ({ name, ...totals(tasks.filter(task => (task.type?.name || "Тодорхойгүй") === name)) })).sort((a,b) => b.tasks - a.tasks);
  const parentIds = new Set(tasks.map(task => task.parentId));
  const parents = data.parents.filter(parent => parentIds.has(parent.id));
  const people = data.people.map(person => ({ ...person, ...totals(tasks.filter(task => person.parentIds.includes(task.parentId))) }));
  const mappedParents = new Set(data.people.flatMap(person => person.parentIds));
  const ungrouped = totals(tasks.filter(task => !mappedParents.has(task.parentId)));
  const halves = [
    { name: "I–VI сар", ...totals(tasks.filter(task => Number(taskMonth(task)) >= 1 && Number(taskMonth(task)) <= 6)) },
    { name: "VII–XII сар", ...totals(tasks.filter(task => Number(taskMonth(task)) >= 7)) },
  ];
  const quality = [
    { name: "Assignment оруулаагүй", count: tasks.filter(task => !task.assignment.length).length },
    { name: "Type оруулаагүй", count: tasks.filter(task => !task.type).length },
    { name: "Due date оруулаагүй", count: tasks.filter(task => !taskDate(task.dueDate)).length },
    { name: "Time estimate оруулаагүй", count: tasks.filter(task => !hasEstimate(task)).length },
  ];
  return { data, tasks, monthly, categories, people, parents, halves, quality, ungrouped, totals: totals(tasks), scope: filterLabel(data, filters), filters, context, generatedAt: new Date().toISOString() };
}
export type WorkReport = ReturnType<typeof buildReport>;
