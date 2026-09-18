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

/** Compare with an equally sized block immediately before the earliest selection, never overlapping it. */
export function previousSprintPeriods(periods: DevSprintPeriod[], selectedIds: string[]) {
  const selected = periods.filter(period => selectedIds.includes(period.id));
  if (!selected.length) return { periods: [] as DevSprintPeriod[], available: false, reason: "" };
  if (selected.length !== new Set(selectedIds).size || selected.some(period => !period.complete || period.partial || period.mode !== selected[0].mode)) {
    return { periods: [] as DevSprintPeriod[], available: false, reason: "Сонгосон sprint-ийн өгөгдөл дутуу" };
  }
  const mode = selected[0].mode;
  const width = mode === "segment" ? 2 : 1;
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
  reportYear: number;
  reportYears?: number[];
  tasks: DevTask[];
  sprints: DevSprint[];
  availableFields: string[];
  availableTaskTypes?: string[];
  partial?: boolean;
  taskPartial?: boolean;
  sprintSyncErrors?: number;
  syncedAt: string;
  cacheSource?: "snapshot" | "clickup";
};

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

export function scopeDevReportTasks(tasks: DevTask[]) {
  return scopeDevTeamTasks(tasks).filter(task => {
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
        position: task.position || "Development",
        totalTasks: 0,
        doneTasks: 0,
        estimateMs: 0,
        completion: 0,
      };
      current.totalTasks += 1;
      current.doneTasks += task.status.done ? 1 : 0;
      current.estimateMs += task.timeEstimateMs || 0;
      if (task.position && current.position === "Development") current.position = task.position;
      current.completion = Math.round((current.doneTasks / current.totalTasks) * 100);
      members.set(id, current);
    }
  }
  return Array.from(members.values()).sort((a, b) => b.totalTasks - a.totalTasks || a.name.localeCompare(b.name));
}

export function monthlyTaskPerformance(tasks: DevTask[], startDate: string, endDate: string, selectedMonthKeys: string[] = []) {
  if (selectedMonthKeys.length) {
    return Array.from(new Set(selectedMonthKeys)).sort().slice(0, 24).map(key => {
      const [year, monthNumber] = key.split("-");
      const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
      const monthTasks = tasks.filter(task => taskDate(task)?.startsWith(key));
      return {
        key,
        month: `${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date)} '${year.slice(-2)}`,
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
      month: `${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date)} '${String(year).slice(-2)}`,
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
