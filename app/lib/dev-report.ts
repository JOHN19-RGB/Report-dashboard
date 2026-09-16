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
  sprintId: string;
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
    const hasSprintFilter = filters.sprintId !== "all";
    const hasDateFilter = !hasSprintFilter && Boolean(filters.startDate || filters.endDate);
    const matchesDate = (!hasDateFilter || Boolean(date)) && (!hasDateFilter || !filters.startDate || date! >= filters.startDate) && (!hasDateFilter || !filters.endDate || date! <= filters.endDate);
    const matchesSprint = !hasSprintFilter || (task.sprintIds || []).includes(filters.sprintId);
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

export function currentSprint(tasks: DevTask[], sprints: DevSprint[] = [], selectedSprintId = "all") {
  const selected = selectedSprintId === "all" ? null : sprints.find(sprint => sprint.id === selectedSprintId);
  if (selected) return selected.name;
  const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayPart = (type: Intl.DateTimeFormatPartTypes) => todayParts.find(item => item.type === type)?.value || "";
  const today = `${todayPart("year")}-${todayPart("month")}-${todayPart("day")}`;
  const current = sprints.find(sprint => (!sprint.startDate || sprint.startDate <= today) && (!sprint.endDate || sprint.endDate >= today) && tasks.some(task => (task.sprintIds || []).includes(sprint.id)));
  if (current) return current.name;
  if (sprints.length) return sprints[0].name;
  const activeSprints = tasks.filter(task => !task.status.done && task.sprint).map(task => task.sprint);
  const allSprints = tasks.map(task => task.sprint).filter(Boolean);
  const candidates = activeSprints.length ? activeSprints : allSprints;
  if (!candidates.length) return "—";
  const counts = new Map<string, number>();
  for (const sprint of candidates) counts.set(sprint, (counts.get(sprint) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}
