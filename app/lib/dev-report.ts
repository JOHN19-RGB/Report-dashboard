export const DEV_TASK_TYPES = ["Imp", "Bug", "Headless", "Hold", "Not bug/imp"] as const;

export type DevTaskType = (typeof DEV_TASK_TYPES)[number];

export type DevMember = {
  id: string;
  position: string;
  name: string;
  presence: number;
};

export type DevTask = {
  id: string;
  title: string;
  type: DevTaskType;
  date: string;
  memberId: string;
  done: boolean;
  estimateHours: number;
  performanceScore: number;
};

export type DevChangeRequest = {
  id: string;
  website: string;
  request: string;
  owner: string;
  date: string;
};

export type DevReportData = {
  reportYear: number;
  sprint: string;
  objectives: { completed: number; total: number };
  members: DevMember[];
  tasks: DevTask[];
  changeRequests: DevChangeRequest[];
};

export type DevReportFilters = {
  search: string;
  startDate: string;
  endDate: string;
  taskType: "all" | DevTaskType;
};

const MEMBERS: DevMember[] = [
  { id: "member-1", position: "Front-End", name: "Ариунбаатар", presence: 93 },
  { id: "member-2", position: "Front-End", name: "Эрдэнэ-жаргал", presence: 88 },
  { id: "member-3", position: "Front-End", name: "Өлзийбаяр", presence: 91 },
  { id: "member-4", position: "Front-End", name: "Маралмаа", presence: 82 },
  { id: "member-5", position: "UI/UX", name: "Есүгэн", presence: 76 },
];

const MONTHLY_TYPE_COUNTS: Record<DevTaskType, number[]> = {
  Imp: [4, 4, 3, 5, 4, 5, 4, 4, 5, 3, 3, 5],
  Bug: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  Headless: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1],
  Hold: [0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0],
  "Not bug/imp": [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
};

function buildTasks(): DevTask[] {
  const tasks: DevTask[] = [];
  let index = 0;

  for (const type of DEV_TASK_TYPES) {
    MONTHLY_TYPE_COUNTS[type].forEach((count, monthIndex) => {
      for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
        const member = MEMBERS[index % MEMBERS.length];
        const sequence = String(index + 1).padStart(3, "0");
        tasks.push({
          id: `DEV-${sequence}`,
          title: `${type} development task ${sequence}`,
          type,
          date: `2026-${String(monthIndex + 1).padStart(2, "0")}-${String(4 + ((index * 3) % 23)).padStart(2, "0")}`,
          memberId: member.id,
          done: index % 8 !== 0,
          estimateHours: 2 + (index % 7) * 0.5,
          performanceScore: 78 + (index % 17),
        });
        index += 1;
      }
    });
  }

  return tasks.sort((a, b) => a.date.localeCompare(b.date));
}

export const DEV_REPORT_DATA: DevReportData = {
  reportYear: 2026,
  sprint: "17–18",
  objectives: { completed: 43, total: 50 },
  members: MEMBERS,
  tasks: buildTasks(),
  changeRequests: [
    { id: "cr-1", website: "Setsukaa.mn", request: "Санал хүсэлт дээр зураг оруулдаг болгох", owner: "Ариунбаатар", date: "2026-02-12" },
    { id: "cr-2", website: "sogolocashmere.mn", request: "Сайт дээр гадаад хэлээр оруулах боломжтой болгох", owner: "Ариунбаатар", date: "2026-04-08" },
    { id: "cr-3", website: "Flamme.mn", request: "Form dropdown олон сонголт нэмэх", owner: "Эрдэнэ-жаргал", date: "2026-05-19" },
    { id: "cr-4", website: "Nox.mn", request: "Checkout — Address хэсгийн мэдээлэл хоосон үед алдаа өгөх", owner: "Өлзийбаяр", date: "2026-08-03" },
    { id: "cr-5", website: "Amuse.mn", request: "Шинэ бичлэг үүсгэдэг урсгалыг сайжруулах", owner: "Маралмаа", date: "2026-09-07" },
  ],
};

function includesSearch(value: string, search: string) {
  return value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
}

export function selectDevTasks(data: DevReportData, filters: DevReportFilters) {
  const membersById = new Map(data.members.map(member => [member.id, member]));
  return data.tasks.filter(task => {
    const member = membersById.get(task.memberId);
    const matchesDate = (!filters.startDate || task.date >= filters.startDate) && (!filters.endDate || task.date <= filters.endDate);
    const matchesType = filters.taskType === "all" || task.type === filters.taskType;
    const matchesSearch = !filters.search || [task.id, task.title, task.type, member?.name || ""].some(value => includesSearch(value, filters.search));
    return matchesDate && matchesType && matchesSearch;
  });
}

export function selectChangeRequests(data: DevReportData, filters: DevReportFilters) {
  return data.changeRequests.filter(request => {
    const matchesDate = (!filters.startDate || request.date >= filters.startDate) && (!filters.endDate || request.date <= filters.endDate);
    const matchesSearch = !filters.search || [request.website, request.request, request.owner].some(value => includesSearch(value, filters.search));
    return matchesDate && matchesSearch;
  });
}

export function taskTypeTotals(tasks: DevTask[]) {
  return DEV_TASK_TYPES.map(type => ({ type, count: tasks.filter(task => task.type === type).length }));
}

export function memberProductivity(data: DevReportData, tasks: DevTask[]) {
  return data.members.map(member => {
    const memberTasks = tasks.filter(task => task.memberId === member.id);
    return {
      ...member,
      estimateHours: memberTasks.reduce((total, task) => total + task.estimateHours, 0),
      totalTasks: memberTasks.length,
      doneTasks: memberTasks.filter(task => task.done).length,
    };
  });
}

export function monthlyTaskPerformance(tasks: DevTask[], year: number) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const month = String(monthIndex + 1).padStart(2, "0");
    const monthTasks = tasks.filter(task => task.date.startsWith(`${year}-${month}`));
    return {
      month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthIndex, 1))),
      bug: monthTasks.filter(task => task.type === "Bug").length,
      imp: monthTasks.filter(task => task.type === "Imp").length,
    };
  });
}
