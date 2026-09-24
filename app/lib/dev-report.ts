export type DevAssignee = {
  id: string | null;
  name: string;
  color: string;
  avatar: string | null;
};

export type DevTask = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string;
  url: string;
  status: { name: string; color: string; type: string; done: boolean };
  assignees: DevAssignee[];
  tags: string[];
  type: string;
  sprint: string;
  sprintIds: string[];
  position: string;
  project: string;
  dueDate: string | null;
  startDate: string | null;
  createdDate: string | null;
  updatedAt: string | null;
  closedDate: string | null;
  timeEstimateMs: number | null;
  priority?: string;
  customFields: Record<string, string>;
};

export type DevSprint = {
  id: string;
  name: string;
  folder: string;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
  partial?: boolean;
};

export type DevSprintPeriodMode = "segment" | "sprint";

export type DevSprintPeriod = {
  id: string;
  label: string;
  mode: DevSprintPeriodMode;
  firstNumber: number;
  lastNumber: number;
  sprintIds: string[];
  startDate: string | null;
  endDate: string | null;
  complete: boolean;
  missingNumbers: number[];
  partial: boolean;
};

/** A logical sprint can have multiple ClickUp list IDs (for example Sprint 32). */
export function buildSprintPeriods(sprints: DevSprint[], mode: DevSprintPeriodMode): DevSprintPeriod[] {
  const groups = new Map<number, DevSprint[]>();
  for (const sprint of sprints) {
    const match = /\bsprint\s*(\d+)\b/i.exec(sprint.name);
    if (!match) continue;
    const number = Number(match[1]);
    if (mode === "segment" && number < 11) continue;
    const firstNumber = mode === "segment" ? 11 + Math.floor((number - 11) / 2) * 2 : number;
    const group = groups.get(firstNumber) || [];
    group.push(sprint);
    groups.set(firstNumber, group);
  }
  return Array.from(groups, ([firstNumber, lists]) => {
    const lastNumber = mode === "segment" ? firstNumber + 1 : firstNumber;
    const numbers = new Set(lists.map(list => Number(/\bsprint\s*(\d+)\b/i.exec(list.name)![1])));
    const listNumber = (list: DevSprint) => Number(/\bsprint\s*(\d+)\b/i.exec(list.name)![1]);
    const starts = lists.filter(list => listNumber(list) === firstNumber).map(list => list.startDate).filter((date): date is string => Boolean(date)).sort();
    const ends = lists.filter(list => listNumber(list) === lastNumber).map(list => list.endDate).filter((date): date is string => Boolean(date)).sort();
    const missingNumbers = Array.from({ length: lastNumber - firstNumber + 1 }, (_, index) => firstNumber + index).filter(number => !numbers.has(number));
    return {
      id: `${mode}-${firstNumber}`,
      label: `Sprint ${firstNumber}${mode === "segment" ? `–${lastNumber}` : ""}`,
      mode,
      firstNumber,
      lastNumber,
      sprintIds: Array.from(new Set(lists.map(list => list.id))),
      startDate: starts[0] || null,
      endDate: ends.at(-1) || null,
      complete: missingNumbers.length === 0,
      missingNumbers,
      partial: lists.some(list => list.partial === true),
    };
  }).sort((a, b) => b.firstNumber - a.firstNumber);
}

/** Compare selected periods with the preceding block; non-sequential selections compare each period to its own predecessor. */
export function previousSprintPeriods(periods: DevSprintPeriod[], selectedIds: string[]) {
  const selected = periods.filter(period => selectedIds.includes(period.id));
  if (!selected.length) return { periods: [] as DevSprintPeriod[], available: false, reason: "" };
  if (selected.length !== new Set(selectedIds).size || selected.some(period => !period.complete || period.partial || period.mode !== selected[0].mode)) {
    return { periods: [] as DevSprintPeriod[], available: false, reason: "Сонгосон sprint-ийн өгөгдөл дутуу" };
  }
  const mode = selected[0].mode;
  const width = mode === "segment" ? 2 : 1;
  const orderedSelected = [...selected].sort((a, b) => a.firstNumber - b.firstNumber);
  const sequential = orderedSelected.every((period, index) => index === 0 || period.firstNumber === orderedSelected[index - 1].firstNumber + width);
  if (!sequential) {
    const previous = selected.map(period => periods.find(candidate => candidate.mode === mode && candidate.firstNumber === period.firstNumber - width));
    if (previous.some(period => !period || !period.complete || period.partial)) {
      return { periods: [] as DevSprintPeriod[], available: false, reason: `Харьцуулах өмнөх ${mode === "segment" ? "segment" : "sprint"}-ийн өгөгдөл алга эсвэл дутуу` };
    }
    return { periods: Array.from(new Map((previous as DevSprintPeriod[]).map(period => [period.id, period])).values()), available: true, reason: "" };
  }
  const earliest = Math.min(...selected.map(period => period.firstNumber));
  const previous = Array.from({ length: selected.length }, (_, index) => periods.find(period => period.mode === mode && period.firstNumber === earliest - width * (index + 1)));
  if (previous.some(period => !period || !period.complete || period.partial)) {
    return { periods: [] as DevSprintPeriod[], available: false, reason: `Харьцуулах өмнөх ${mode === "segment" ? "segment" : "sprint"}-ийн өгөгдөл алга эсвэл дутуу` };
  }
  return { periods: previous as DevSprintPeriod[], available: true, reason: "" };
}

/** An unweighted average of the five configured people; no assigned tasks contributes 0%. */
export function teamCompletionAverage(tasks: DevTask[]) {
  const members = DEV_TEAM_ASSIGNEES.map(name => {
    const assigned = tasks.filter(task => task.assignees.some(assignee => normalizeAssigneeName(assignee.name) === normalizeAssigneeName(name)));
    const doneTasks = assigned.filter(task => task.status.done).length;
    return { name, totalTasks: assigned.length, doneTasks, completion: assigned.length ? doneTasks / assigned.length * 100 : 0 };
  });
  return { members, average: members.reduce((sum, member) => sum + member.completion, 0) / DEV_TEAM_ASSIGNEES.length };
}

/** Null means a new, nonzero value with no nonzero baseline, not an infinite percentage. */
export function metricPercentChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous * 100;
}

export type DevReportData = {
  schemaVersion?: number;
  workspace: { id: string; name: string; color: string; memberCount: number };
  list: { id: string; name: string };
  allProjectList?: { id: string; name: string } | null;
  allProjectTasks?: DevTask[];
  allProjectPartial?: boolean;
  allProjectTaskSyncedAt?: string;
  reportYear: number;
  reportYears?: number[];
  tasks: DevTask[];
  sprints: DevSprint[];
  availableFields: string[];
  availableTaskTypes?: string[];
  partial?: boolean;
  taskPartial?: boolean;
  sprintSyncErrors?: number;
  sprintNeedsFullRefresh?: boolean;
  sprintDiscoveryPartial?: boolean;
  taskSyncedAt?: string;
  sprintSyncedAt?: string;
  syncedAt: string;
  cacheSource?: "snapshot" | "clickup";
};

export function isDevReportData(value: unknown): value is DevReportData {
  const report = value as DevReportData | null;
  return Boolean(report && typeof report.syncedAt === "string" && report.list && Array.isArray(report.tasks) && Array.isArray(report.sprints));
}

export const DEV_REPORT_START_YEAR = 2025;
export const DEV_REPORT_END_YEAR = 2026;
export const DEV_REPORT_START_DATE = `${DEV_REPORT_START_YEAR}-01-01`;
export const DEV_REPORT_END_DATE = `${DEV_REPORT_END_YEAR}-12-31`;

export const DEV_TEAM_ASSIGNEES = [
  "Ariunbileg Garam-Ayush",
  "Ulziibayar S",
  "maralmaa",
  "Erdenejargal",
  "Yesugen",
] as const;

function normalizeAssigneeName(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function devTeamPosition(name: string, fallback = "Development") {
  return normalizeAssigneeName(name) === "yesugen" ? "Designer" : fallback;
}

const DEV_TEAM_ASSIGNEE_NAMES = new Set(DEV_TEAM_ASSIGNEES.map(normalizeAssigneeName));

export function scopeDevTeamTasks(tasks: DevTask[]) {
  return tasks.flatMap(task => {
    const assignees = task.assignees.filter(assignee => DEV_TEAM_ASSIGNEE_NAMES.has(normalizeAssigneeName(assignee.name)));
    return assignees.length ? [{ ...task, assignees }] : [];
  });
}

export type DevReportFilters = {
  search: string;
  startDate: string;
  endDate: string;
  taskType: string;
  sprintIds: string[];
};

export type DevProjectStatusKey = "todo" | "inProgress" | "qa" | "hold" | "done";
export type DevProjectSortKey = "project" | "status" | "tasks" | "completion" | "updated";
export type DevProjectSort = { key: DevProjectSortKey; direction: "asc" | "desc" } | null;

type DevListCandidate = { id: string; name: string; space?: string; folder?: string };

/** Select the explicitly named All Project(s) list; never substitute the B2C master list. */
export function selectDevAllProjectList<Candidate extends DevListCandidate>(candidates: Candidate[]): Candidate | null {
  const ranked = candidates.map(candidate => {
    const name = candidate.name.trim().toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
    const hierarchy = `${candidate.space || ""} ${candidate.folder || ""} ${candidate.name}`.trim().toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
    const exact = /^(?:dev\s+)?all\s+projects?$/.test(name) || /^(?:бүх|нийт)\s+төслүүд?$/.test(name);
    const named = /\ball\s+projects?\b/.test(name) || /(?:бүх|нийт)\s+төслүүд?/.test(name);
    const score = (exact ? 200 : 0) + (named ? 100 : 0) + (/\bdev\b|development|b2c/.test(hierarchy) ? 12 : 0);
    return { candidate, score };
  }).sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "mn"));
  return ranked[0]?.score >= 100 ? ranked[0].candidate : null;
}

export const DEV_PROJECT_STATUSES: Array<{ key: DevProjectStatusKey; label: string; color: string }> = [
  { key: "todo", label: "To do", color: "#94a3b8" },
  { key: "inProgress", label: "In Progress", color: "#6d9eff" },
  { key: "qa", label: "QA test", color: "#8b79ff" },
  { key: "hold", label: "Hold", color: "#f3a21b" },
  { key: "done", label: "Done", color: "#2dbb7f" },
];

const DEV_PROJECT_SORT_FIRST_DIRECTION: Record<DevProjectSortKey, "asc" | "desc"> = { project: "asc", status: "asc", tasks: "desc", completion: "desc", updated: "desc" };

/** Column sorting cycles first order → reverse order → the original ClickUp/default order. */
export function nextDevProjectSort(current: DevProjectSort, key: DevProjectSortKey): DevProjectSort {
  const firstDirection = DEV_PROJECT_SORT_FIRST_DIRECTION[key];
  if (!current || current.key !== key) return { key, direction: firstDirection };
  if (current.direction === firstDirection) return { key, direction: firstDirection === "asc" ? "desc" : "asc" };
  return null;
}

/** Collapse ClickUp's workspace-specific statuses into the five All Project lanes. */
export function devProjectStatus(task: DevTask): DevProjectStatusKey {
  const status = task.status.name.trim().toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const type = task.status.type.trim().toLocaleLowerCase("en-US");
  if (/\bqa\s*test\b|quality assurance|\breview\b|need to deploy/.test(status)) return "qa";
  if (/\bhold\b|blocked|waiting|хүлээлт/.test(status)) return "hold";
  if (/\bin\s*progress\b|^progress$|^doing$/.test(status)) return "inProgress";
  if (task.status.done || type === "done" || type === "closed") return "done";
  return "todo";
}

/** Prefer ClickUp's project field, then the parent/root task prefix used by B2C Master. */
export function devProjectName(task: DevTask) {
  const project = task.project.trim();
  const genericProjectValue = /^(?:b2c\s+)?all\s+projects?$|^projects?$/.test(project.toLocaleLowerCase("en-US").replace(/[._-]+/g, " ").replace(/\s+/g, " "));
  const source = (genericProjectValue ? "" : project) || task.parentName.trim() || task.name.trim();
  return source.split("|")[0].trim() || "Төсөл тодорхойгүй";
}

function devProjectConnectionKey(value: string) {
  return value
    .split("|")[0]
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\b(?:v\s*)?\d+(?:\.\d+)*\b/g, "")
    .replace(/\b(?:www|mn|com|net|org)\b/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "");
}

function devTaskConnectionKey(value: string) {
  const [site = "", ...workParts] = value.split("|");
  const work = workParts.join("|")
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/front[\s_-]*end\s+(?:dev(?:elopment)?|хөгжүүлэлт)/g, "frontend")
    .replace(/ui\s*ux\s*design/g, "design")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "");
  return `${devProjectConnectionKey(site)}|${work}`;
}

/** Connect All Projects records to exact Master tasks, with a site fallback for project roots. */
export function connectDevAllProjectSprints(allProjectTasks: DevTask[], masterTasks: DevTask[]) {
  const sprintByProject = new Map<string, { ids: Set<string>; names: Set<string> }>();
  const sprintByTask = new Map<string, { ids: Set<string>; names: Set<string> }>();
  for (const task of masterTasks) {
    if (!task.sprintIds?.length) continue;
    const projectKey = devProjectConnectionKey(devProjectName(task));
    if (projectKey) {
      const connection = sprintByProject.get(projectKey) || { ids: new Set<string>(), names: new Set<string>() };
      task.sprintIds.forEach(id => connection.ids.add(id));
      if (task.sprint) connection.names.add(task.sprint);
      sprintByProject.set(projectKey, connection);
    }
    const taskKey = devTaskConnectionKey(task.name);
    if (taskKey) {
      const connection = sprintByTask.get(taskKey) || { ids: new Set<string>(), names: new Set<string>() };
      task.sprintIds.forEach(id => connection.ids.add(id));
      if (task.sprint) connection.names.add(task.sprint);
      sprintByTask.set(taskKey, connection);
    }
  }

  const byId = new Map(allProjectTasks.map(task => [task.id, task]));
  return allProjectTasks.map(task => {
    let root = task;
    const visited = new Set([task.id]);
    while (root.parentId) {
      const parent = byId.get(root.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      root = parent;
    }
    const relationship = Object.entries(task.customFields || {}).find(([name]) => /relationship\s+b2c/i.test(name))?.[1] || "";
    const relationshipConnection = relationship
      ? sprintByTask.get(devTaskConnectionKey(relationship))
      : undefined;
    const directConnection = relationshipConnection || sprintByTask.get(devTaskConnectionKey(task.name));
    const projectConnection = !task.parentId && !task.name.includes("|")
      ? sprintByProject.get(devProjectConnectionKey(devProjectName(root)))
      : undefined;
    const connection = directConnection || projectConnection;
    const sprintIds = connection ? Array.from(connection.ids) : [];
    const sprint = connection ? Array.from(connection.names).join(", ") : "";
    return { ...task, sprintIds, sprint };
  });
}

export function groupDevProjectTasks(tasks: DevTask[]) {
  const groups = new Map<string, { name: string; tasks: DevTask[] }>();
  for (const task of tasks) {
    const name = devProjectName(task);
    const key = name.toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
    const group = groups.get(key) || { name, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(group => {
    const statuses = Object.fromEntries(DEV_PROJECT_STATUSES.map(status => [status.key, 0])) as Record<DevProjectStatusKey, number>;
    for (const task of group.tasks) statuses[devProjectStatus(task)] += 1;
    return {
      ...group,
      statuses,
      done: statuses.done,
      completion: group.tasks.length ? Math.round(statuses.done / group.tasks.length * 100) : 0,
      latestDate: group.tasks.map(task => task.updatedAt || taskDate(task) || "").sort().at(-1) || "",
    };
  }).sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name, "mn"));
}

/** Group filtered All Projects records by their ClickUp root task, preserving duplicate project names. */
export function groupDevAllProjectTasks(tasks: DevTask[], contextTasks: DevTask[] = tasks) {
  const contextById = new Map(contextTasks.map(task => [task.id, task]));
  const groups = new Map<string, { id: string; name: string; rootTask: DevTask; tasks: DevTask[] }>();

  for (const task of tasks) {
    let root = task;
    const visited = new Set([task.id]);
    while (root.parentId) {
      const parent = contextById.get(root.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      root = parent;
    }
    const id = root.parentId && !contextById.has(root.parentId) ? `parent:${root.parentId}` : root.id;
    const fallbackName = root.parentName.trim() || task.parentName.trim() || task.name.trim();
    const group = groups.get(id) || { id, name: root === task || !root.parentId ? devProjectName(root) : fallbackName, rootTask: root, tasks: [] };
    group.tasks.push(task);
    groups.set(id, group);
  }

  return Array.from(groups.values()).map(group => {
    const subtasks = group.tasks.filter(task => task.parentId === group.rootTask.id);
    const progressTasks = subtasks.length ? subtasks : [group.rootTask];
    const statuses = Object.fromEntries(DEV_PROJECT_STATUSES.map(status => [status.key, 0])) as Record<DevProjectStatusKey, number>;
    for (const task of progressTasks) statuses[devProjectStatus(task)] += 1;
    return {
      ...group,
      subtasks,
      statuses,
      done: statuses.done,
      completion: progressTasks.length ? Math.round(statuses.done / progressTasks.length * 100) : 0,
      latestDate: group.tasks.map(task => task.updatedAt || taskDate(task) || "").sort().at(-1) || "",
    };
  }).sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name, "mn"));
}

export type DevMemberProductivity = {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
  position: string;
  totalTasks: number;
  doneTasks: number;
  estimateMs: number;
  completion: number;
};

/** Shares use the exact Total Tasks column; multi-assignee tasks contribute to each person's total. */
export function memberTaskDistribution(members: DevMemberProductivity[]) {
  const total = members.reduce((sum, member) => sum + member.totalTasks, 0);
  return { total, members: members.map(member => ({ ...member, share: total ? member.totalTasks / total * 100 : 0 })) };
}

export function taskDate(task: DevTask) {
  return task.dueDate || task.closedDate || task.startDate || task.createdDate;
}

export function filterDevTasksByMonthKeys(tasks: DevTask[], selectedMonthKeys: string[]) {
  const allowedMonths = new Set(selectedMonthKeys);
  return tasks.filter(task => {
    const date = taskDate(task);
    return Boolean(date && allowedMonths.has(date.slice(0, 7)));
  });
}

/** Count ClickUp parent tasks only; any number of subtasks still represents one task. */
export function topLevelDevTasks(tasks: DevTask[]) {
  return tasks.filter(task => !task.parentId);
}

export function scopeDevReportTasks(tasks: DevTask[]) {
  return tasks.filter(task => {
    const date = taskDate(task);
    return Boolean(date && date >= DEV_REPORT_START_DATE && date <= DEV_REPORT_END_DATE);
  });
}

function includesSearch(value: string, search: string) {
  return value.toLocaleLowerCase("mn-MN").includes(search.trim().toLocaleLowerCase("mn-MN"));
}

export function selectDevTasks(data: DevReportData, filters: DevReportFilters) {
  return data.tasks.filter(task => {
    const date = taskDate(task);
    const hasSprintFilter = filters.sprintIds.length > 0;
    const hasDateFilter = !hasSprintFilter && Boolean(filters.startDate || filters.endDate);
    const matchesDate = (!hasDateFilter || Boolean(date)) && (!hasDateFilter || !filters.startDate || date! >= filters.startDate) && (!hasDateFilter || !filters.endDate || date! <= filters.endDate);
    const matchesSprint = !hasSprintFilter || filters.sprintIds.some(id => (task.sprintIds || []).includes(id));
    const matchesType = filters.taskType === "all" || task.type === filters.taskType;
    const searchable = [task.id, task.name, task.parentName, task.project, task.type, task.sprint, task.status.name, ...(task.tags || []), ...task.assignees.map(person => person.name), ...Object.values(task.customFields)];
    const matchesSearch = !filters.search || searchable.some(value => includesSearch(value, filters.search));
    return matchesDate && matchesSprint && matchesType && matchesSearch;
  });
}

export function taskTypeTotals(tasks: DevTask[]) {
  const counts = new Map<string, { type: string; count: number; color: string }>();
  for (const task of tasks) {
    const type = task.type || "Тодорхойгүй";
    if (type === "Тодорхойгүй") continue;
    const current = counts.get(type) || { type, count: 0, color: "" };
    current.count += 1;
    counts.set(type, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export function memberProductivity(tasks: DevTask[]): DevMemberProductivity[] {
  const members = new Map<string, DevMemberProductivity>();
  for (const task of tasks) {
    for (const assignee of task.assignees) {
      const id = assignee.id || assignee.name;
      const current = members.get(id) || {
        id,
        name: assignee.name,
        color: assignee.color,
        avatar: assignee.avatar,
        position: devTeamPosition(assignee.name, task.position || "Development"),
        totalTasks: 0,
        doneTasks: 0,
        estimateMs: 0,
        completion: 0,
      };
      current.totalTasks += 1;
      current.doneTasks += task.status.done ? 1 : 0;
      current.estimateMs += task.timeEstimateMs || 0;
      if (task.position && current.position === "Development") current.position = devTeamPosition(assignee.name, task.position);
      current.completion = Math.round((current.doneTasks / current.totalTasks) * 100);
      members.set(id, current);
    }
  }
  return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks || a.name.localeCompare(b.name));
}

/** The productivity list/card is intentionally limited to the five configured team members. */
export function devTeamProductivity(tasks: DevTask[]) {
  const allMembers = memberProductivity(tasks);
  return DEV_TEAM_ASSIGNEES.map(name => {
    const matches = allMembers.filter(member => normalizeAssigneeName(member.name) === normalizeAssigneeName(name));
    const first = matches[0];
    const totalTasks = matches.reduce((sum, member) => sum + member.totalTasks, 0);
    const doneTasks = matches.reduce((sum, member) => sum + member.doneTasks, 0);
    return {
      id: first?.id || name,
      name: first?.name || name,
      color: first?.color || "",
      avatar: first?.avatar || null,
      position: devTeamPosition(name, first?.position || "Development"),
      totalTasks,
      doneTasks,
      estimateMs: matches.reduce((sum, member) => sum + member.estimateMs, 0),
      completion: totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0,
    };
  }).sort((a, b) => b.totalTasks - a.totalTasks || a.name.localeCompare(b.name));
}

/** Keep the named five in the pie and combine every other ClickUp assignee into Бусад. */
export function devProductivityDistributionMembers(tasks: DevTask[]) {
  const allMembers = memberProductivity(tasks);
  const team = devTeamProductivity(tasks);
  const otherMembers = allMembers.filter(member => !DEV_TEAM_ASSIGNEE_NAMES.has(normalizeAssigneeName(member.name)));
  if (!otherMembers.length) return team;
  const totalTasks = otherMembers.reduce((sum, member) => sum + member.totalTasks, 0);
  const doneTasks = otherMembers.reduce((sum, member) => sum + member.doneTasks, 0);
  return [...team, {
    id: "dev-team-others",
    name: "Бусад",
    color: "#94a3b8",
    avatar: null,
    position: "Бусад",
    totalTasks,
    doneTasks,
    estimateMs: otherMembers.reduce((sum, member) => sum + member.estimateMs, 0),
    completion: totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0,
  }];
}

export function monthlyTaskPerformance(tasks: DevTask[], startDate: string, endDate: string, selectedMonthKeys: string[] = []) {
  if (selectedMonthKeys.length) {
    return Array.from(new Set(selectedMonthKeys)).sort().slice(0, 24).map(key => {
      const [year, monthNumber] = key.split("-");
      const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
      const monthTasks = tasks.filter(task => taskDate(task)?.startsWith(key));
      return {
        key,
        month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
        bug: monthTasks.filter(task => task.type === "Bug").length,
        imp: monthTasks.filter(task => task.type === "Imp").length,
      };
    });
  }

  const startMatch = /^(\d{4})-(\d{2})/.exec(startDate);
  const endMatch = /^(\d{4})-(\d{2})/.exec(endDate);
  const startYear = Number(startMatch?.[1]) || 2025;
  const startMonth = Math.min(11, Math.max(0, (Number(startMatch?.[2]) || 1) - 1));
  const endYear = Number(endMatch?.[1]) || startYear;
  const endMonth = Math.min(11, Math.max(0, (Number(endMatch?.[2]) || 12) - 1));
  const monthCount = Math.min(24, Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth + 1));

  return Array.from({ length: monthCount }, (_, offset) => {
    const date = new Date(Date.UTC(startYear, startMonth + offset, 1));
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth();
    const monthNumber = String(monthIndex + 1).padStart(2, "0");
    const key = `${year}-${monthNumber}`;
    const monthTasks = tasks.filter(task => taskDate(task)?.startsWith(key));
    return {
      key,
      month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
      bug: monthTasks.filter(task => task.type === "Bug").length,
      imp: monthTasks.filter(task => task.type === "Imp").length,
    };
  });
}

export function changeRequestRows(tasks: DevTask[]) {
  return tasks.filter(task => task.parentName.trim()).sort((a, b) => {
    const latestA = a.updatedAt || a.createdDate || a.closedDate || a.dueDate || a.startDate || "";
    const latestB = b.updatedAt || b.createdDate || b.closedDate || b.dueDate || b.startDate || "";
    return latestB.localeCompare(latestA);
  }).map(task => ({
    id: task.id,
    website: task.parentName.split("|")[0].trim() || task.parentName,
    request: task.name,
    owner: task.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй",
    url: task.url,
  }));
}

export function reportMetrics(tasks: DevTask[]) {
  const doneTasks = tasks.filter(task => task.status.done);
  const dueDatedDone = doneTasks.filter(task => task.dueDate && task.closedDate);
  const onTimeTasks = dueDatedDone.filter(task => task.closedDate! <= task.dueDate!);
  const objectiveAchievement = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const performance = dueDatedDone.length ? Math.round((onTimeTasks.length / dueDatedDone.length) * 100) : objectiveAchievement;
  const estimateMs = tasks.reduce((sum, task) => sum + (task.timeEstimateMs || 0), 0);
  return { doneTasks: doneTasks.length, objectiveAchievement, performance, estimateMs };
}

export function formatSprintDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return "Огноо тодорхойгүй";
  const includeYear = Boolean(startDate && endDate && startDate.slice(0, 4) !== endDate.slice(0, 4));
  const format = (value: string | null) => {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${includeYear ? `${year}/` : ""}${Number(month)}/${Number(day)}`;
  };
  return `${format(startDate)} - ${format(endDate)}`;
}

export function currentSprint(tasks: DevTask[], sprints: DevSprint[] = [], selectedSprintIds: string[] = []) {
  if (selectedSprintIds.length > 1) return `${selectedSprintIds.length} Sprints`;
  const selected = sprints.find(sprint => sprint.id === selectedSprintIds[0]);
  if (selected) return selected.name;
  const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayPart = (type: Intl.DateTimeFormatPartTypes) => todayParts.find(item => item.type === type)?.value || "";
  const today = `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;
  const current = sprints.find(sprint => (!sprint.startDate || sprint.startDate <= today) && (!sprint.endDate || sprint.endDate >= today) && tasks.some(task => (task.sprintIds || []).includes(sprint.id)));
  if (current) return current.name;
  const latestWithTasks = sprints.find(sprint => tasks.some(task => (task.sprintIds || []).includes(sprint.id)));
  if (latestWithTasks) return latestWithTasks.name;
  const activeSprints = tasks.filter(task => !task.status.done && task.sprint).map(task => task.sprint);
  const allSprints = tasks.map(task => task.sprint).filter(Boolean);
  const candidates = activeSprints.length ? activeSprints : allSprints;
  if (!candidates.length) return "—";
  const counts = new Map<string, number>();
  for (const sprint of candidates) counts.set(sprint, (counts.get(sprint) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}
