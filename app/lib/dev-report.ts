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
  type: string;
  sprint: string;
  sprintIds: string[];
  position: string;
  project: string;
  dueDate: string | null;
  startDate: string | null;
  createdDate: string | null;
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
  tasks: DevTask[];
  sprints: DevSprint[];
  availableFields: string[];
  partial?: boolean;
  taskPartial?: boolean;
  sprintSyncErrors?: number;
  syncedAt: string;
  cacheSource?: "snapshot" | "clickup";
};

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
    const searchable = [task.id, task.name, task.parentName, task.project, task.type, task.sprint, task.status.name, ...task.assignees.map(person => person.name), ...Object.values(task.customFields)];
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

export function monthlyTaskPerformance(tasks: DevTask[], year: number) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const month = String(monthIndex + 1).padStart(2, "0");
    const monthTasks = tasks.filter(task => taskDate(task)?.startsWith(`${year}-${month}`));
    return {
      month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthIndex, 1))),
      bug: monthTasks.filter(task => task.type === "Bug").length,
      imp: monthTasks.filter(task => task.type === "Imp").length,
    };
  });
}

export function changeRequestRows(tasks: DevTask[]) {
  const nested = tasks.filter(task => task.parentId || task.parentName || task.project);
  return (nested.length ? nested : tasks).map(task => ({
    id: task.id,
    website: task.project || task.parentName || "B2C Master",
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
  const activeSprints = tasks.filter(task => !task.status.done && task.sprint).map(task => task.sprint);
  const allSprints = tasks.map(task => task.sprint).filter(Boolean);
  const candidates = activeSprints.length ? activeSprints : allSprints;
  if (!candidates.length) return "—";
  const counts = new Map<string, number>();
  for (const sprint of candidates) counts.set(sprint, (counts.get(sprint) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}
