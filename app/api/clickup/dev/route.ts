import { eq } from "drizzle-orm";
import { getDbOrNull } from "../../../../db";
import { clickUpSnapshots } from "../../../../db/schema";
import { DEV_REPORT_END_YEAR, DEV_REPORT_START_YEAR, scopeDevReportTasks, type DevTask } from "../../../lib/dev-report";

type ClickUpUser = {
  id?: number;
  username?: string;
  color?: string | null;
  profilePicture?: string | null;
};

type DropdownOption = {
  id?: string;
  name?: string;
  label?: string;
  color?: string | null;
  orderindex?: number;
};

type ClickUpCustomField = {
  id?: string;
  name?: string;
  value?: unknown;
  type_config?: { options?: DropdownOption[] };
};

type ClickUpTask = {
  id?: string;
  name?: string;
  parent?: string | null;
  url?: string;
  status?: { status?: string; color?: string; type?: string };
  assignees?: ClickUpUser[];
  tags?: Array<{ name?: string }>;
  custom_item_id?: string | number | null;
  due_date?: string | null;
  start_date?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  date_closed?: string | null;
  time_estimate?: number | null;
  custom_fields?: ClickUpCustomField[];
};

type ClickUpCustomTaskType = {
  id?: string | number;
  name?: string;
};

type ClickUpList = {
  id?: string;
  name?: string;
  start_date?: string | null;
  due_date?: string | null;
  task_count?: number | string | null;
};
type ClickUpListLocation = {
  id: string;
  name: string;
  space: string;
  folder: string;
  startDate: string | null;
  endDate: string | null;
  taskCount: number;
};
type SnapshotPayload = Record<string, unknown> & { syncedAt: string };

const SNAPSHOT_ID = 2;
const SNAPSHOT_VERSION = 8;

async function encodeSnapshot(payload: SnapshotPayload) {
  const compressed = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

async function decodeSnapshot(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const decompressed = new Response(bytes.buffer).body!.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(decompressed).text()) as SnapshotPayload;
}

async function readSnapshot() {
  const db = getDbOrNull();
  if (!db) return null;
  const [row] = await db.select().from(clickUpSnapshots).where(eq(clickUpSnapshots.id, SNAPSHOT_ID)).limit(1);
  return row ? decodeSnapshot(row.payload) : null;
}

async function saveSnapshot(payload: SnapshotPayload) {
  const db = getDbOrNull();
  if (!db) return;
  const encoded = await encodeSnapshot(payload);
  await db.insert(clickUpSnapshots).values({ id: SNAPSHOT_ID, payload: encoded, syncedAt: payload.syncedAt }).onConflictDoUpdate({
    target: clickUpSnapshots.id,
    set: { payload: encoded, syncedAt: payload.syncedAt },
  });
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeColor(value: unknown, fallback = "#7b68ee") {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function normalize(value: unknown) {
  return safeText(value).trim().toLocaleLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function dateToIso(value: string | null | undefined) {
  if (!value || !Number.isFinite(Number(value))) return null;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timestampToIso(value: string | null | undefined) {
  if (!value || !Number.isFinite(Number(value))) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapAssignees(users: ClickUpUser[] | undefined) {
  return (users || []).map(user => ({
    id: user.id == null ? null : String(user.id),
    name: safeText(user.username, "Тодорхойгүй"),
    color: safeColor(user.color, "#64748b"),
    avatar: safeText(user.profilePicture) || null,
  }));
}

function resolveCustomValue(field: ClickUpCustomField) {
  if (field.value == null) return "";
  const options = field.type_config?.options || [];
  const resolveOption = (value: unknown) => {
    const option = options.find(item => item.id === String(value) || item.orderindex === Number(value));
    return safeText(option?.name || option?.label);
  };
  if (Array.isArray(field.value)) {
    return field.value.map(value => resolveOption(value) || (typeof value === "object" && value ? safeText((value as { username?: string; name?: string }).username || (value as { name?: string }).name) : safeText(value))).filter(Boolean).join(", ");
  }
  const option = resolveOption(field.value);
  if (option) return option;
  if (typeof field.value === "object") {
    const object = field.value as { formatted_address?: string; address?: string; label?: string; name?: string };
    return safeText(object.formatted_address || object.address || object.label || object.name);
  }
  return String(field.value);
}

function customFieldMap(fields: ClickUpCustomField[] | undefined) {
  return Object.fromEntries((fields || []).map(field => [safeText(field.name, "Тодорхойгүй"), resolveCustomValue(field)]).filter(([, value]) => value));
}

function findField(fields: Record<string, string>, patterns: RegExp[]) {
  const entry = Object.entries(fields).find(([name]) => patterns.some(pattern => pattern.test(normalize(name))));
  return entry?.[1] || "";
}

function knownTaskType(value: string) {
  const normalized = normalize(value);
  if (/not bug|not imp/.test(normalized)) return "Not bug/imp";
  if (/improvement|(^|\s)imp(\s|$)/.test(normalized)) return "Imp";
  if (/bugs?|алдаа/.test(normalized)) return "Bug";
  if (/headless/.test(normalized)) return "Headless";
  if (/hold|хүлээлт/.test(normalized)) return "Hold";
  return "";
}

function customTaskTypeName(customItemId: ClickUpTask["custom_item_id"], customTaskTypes: Map<string, string>) {
  if (customItemId == null || String(customItemId) === "0") return "Task";
  if (String(customItemId) === "1") return "Milestone";
  return customTaskTypes.get(String(customItemId)) || "";
}

function resolveTaskType(task: ClickUpTask, fields: Record<string, string>, parent: ClickUpTask | undefined, customTaskTypes: Map<string, string>) {
  const typeName = customTaskTypeName(task.custom_item_id, customTaskTypes);
  const customFieldType = findField(fields, [/^type$/, /^task type$/, /төрөл/]);
  const currentSignals = [typeName, customFieldType, ...(task.tags || []).map(tag => safeText(tag.name)), safeText(task.status?.status)];
  const currentKnownType = currentSignals.map(knownTaskType).find(Boolean);
  if (currentKnownType) return currentKnownType;
  if (typeName && typeName !== "Task") return typeName;
  if (customFieldType) return customFieldType;

  if (parent) {
    const parentFields = customFieldMap(parent.custom_fields);
    const parentTypeName = customTaskTypeName(parent.custom_item_id, customTaskTypes);
    const parentFieldType = findField(parentFields, [/^type$/, /^task type$/, /төрөл/]);
    const parentSignals = [parentTypeName, parentFieldType, ...(parent.tags || []).map(tag => safeText(tag.name)), safeText(parent.status?.status)];
    const inheritedKnownType = parentSignals.map(knownTaskType).find(Boolean);
    if (inheritedKnownType) return inheritedKnownType;
    if (parentTypeName && parentTypeName !== "Task") return parentTypeName;
    if (parentFieldType) return parentFieldType;
  }

  return typeName || "Task";
}

async function clickUpFetch(path: string, token: string) {
  return fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    cache: "no-store",
  });
}

async function clickUpJson<T>(path: string, token: string) {
  const response = await clickUpFetch(path, token);
  if (!response.ok) throw new Error(`ClickUp request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function discoverWorkspaceLists(workspaceId: string, token: string) {
  const spacesData = await clickUpJson<{ spaces?: Array<{ id?: string; name?: string }> }>(`/team/${encodeURIComponent(workspaceId)}/space?archived=false`, token);
  const candidates: ClickUpListLocation[] = [];

  await Promise.all((spacesData.spaces || []).map(async space => {
    if (!space.id) return;
    const [foldersData, listsData] = await Promise.all([
      clickUpJson<{ folders?: Array<{ id?: string; name?: string; lists?: ClickUpList[] }> }>(`/space/${encodeURIComponent(space.id)}/folder?archived=false`, token),
      clickUpJson<{ lists?: ClickUpList[] }>(`/space/${encodeURIComponent(space.id)}/list?archived=false`, token),
    ]);
    for (const list of listsData.lists || []) {
      if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: "", startDate: dateToIso(list.start_date), endDate: dateToIso(list.due_date), taskCount: Number(list.task_count) || 0 });
    }
    for (const folder of foldersData.folders || []) {
      for (const list of folder.lists || []) {
        if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: safeText(folder.name), startDate: dateToIso(list.start_date), endDate: dateToIso(list.due_date), taskCount: Number(list.task_count) || 0 });
      }
    }
    const sprintFolders = (foldersData.folders || []).filter(folder => folder.id && /sprints?|спринт/.test(normalize(folder.name)));
    const archivedLists = await Promise.all(sprintFolders.map(folder => clickUpJson<{ lists?: ClickUpList[] }>(`/folder/${encodeURIComponent(folder.id!)}/list?archived=true`, token).then(data => ({ folder, lists: data.lists || [] })).catch(() => ({ folder, lists: [] as ClickUpList[] }))));
    for (const result of archivedLists) {
      for (const list of result.lists) {
        if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: safeText(result.folder.name), startDate: dateToIso(list.start_date), endDate: dateToIso(list.due_date), taskCount: Number(list.task_count) || 0 });
      }
    }
  }));

  return Array.from(new Map(candidates.map(candidate => [candidate.id, candidate])).values());
}

function isSprintList(candidate: ClickUpListLocation) {
  const listName = normalize(candidate.name);
  const folderName = normalize(candidate.folder);
  const hierarchy = normalize(`${candidate.space} ${candidate.folder} ${candidate.name}`);
  const isBacklog = /backlog|master|төслийн жагсаалт|ажлын жагсаалт/.test(listName);
  const sprintNamed = /sprints?|спринт/.test(hierarchy);
  const numberedCycle = /^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(listName);
  const hasCycleDates = Boolean(candidate.startDate && candidate.endDate);
  return !isBacklog && (numberedCycle || /sprints?|спринт/.test(listName) || (sprintNamed && hasCycleDates) || (/sprints?|спринт/.test(folderName) && numberedCycle));
}

async function resolveB2cWorkspace(workspaceId: string, token: string) {
  const candidates = await discoverWorkspaceLists(workspaceId, token);
  const configuredListId = process.env.CLICKUP_B2C_MASTER_LIST_ID;
  let list: { id: string; name: string } | null = null;
  if (configuredListId) {
    const configured = candidates.find(candidate => candidate.id === configuredListId) || await clickUpJson<ClickUpList>(`/list/${encodeURIComponent(configuredListId)}`, token);
    if (configured.id) list = { id: configured.id, name: safeText(configured.name, "B2C Master") };
  }

  const scored = candidates.map(candidate => {
    const listName = normalize(candidate.name);
    const hierarchy = normalize(`${candidate.space} ${candidate.folder} ${candidate.name}`);
    const score = (listName === "b2c master" ? 100 : 0) + (listName.includes("b2c") ? 35 : 0) + (listName.includes("master") ? 30 : 0) + (hierarchy.includes("b2c") ? 12 : 0) + (hierarchy.includes("master") ? 8 : 0);
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score);

  if (!list) {
    if (!scored[0] || scored[0].score < 50) throw new Error("B2C Master list олдсонгүй.");
    list = { id: scored[0].id, name: scored[0].name || "B2C Master" };
  }

  const reportStart = `${DEV_REPORT_START_YEAR}-01-01`;
  const reportEnd = `${DEV_REPORT_END_YEAR}-12-31`;
  const sprintLists = candidates
    .filter(candidate => candidate.id !== list.id && isSprintList(candidate))
    .filter(candidate => !candidate.startDate || !candidate.endDate || (candidate.startDate <= reportEnd && candidate.endDate >= reportStart))
    .sort((a, b) => (b.startDate || b.endDate || "").localeCompare(a.startDate || a.endDate || "") || b.name.localeCompare(a.name, undefined, { numeric: true }))
    .slice(0, 64);
  return { list, sprintLists };
}

async function getListTasks(listId: string, token: string, options: { includeTiml?: boolean; pageLimit?: number; batchSize?: number } = {}) {
  const tasks: ClickUpTask[] = [];
  const pageLimit = options.pageLimit || 100;
  const batchSize = options.batchSize || 5;
  for (let batchStart = 0; batchStart < pageLimit; batchStart += batchSize) {
    const pages = await Promise.all(Array.from({ length: batchSize }, async (_, offset) => {
      const page = batchStart + offset;
      const query = new URLSearchParams({ archived: "false", include_closed: "true", subtasks: "true", include_timl: options.includeTiml ? "true" : "false", page: String(page), order_by: "due_date", reverse: "true" });
      return clickUpJson<{ tasks?: ClickUpTask[]; last_page?: boolean }>(`/list/${encodeURIComponent(listId)}/task?${query}`, token);
    }));
    const completePageIndex = pages.findIndex(data => data.last_page === true || (data.tasks || []).length < 100);
    const pagesToKeep = completePageIndex >= 0 ? pages.slice(0, completePageIndex + 1) : pages;
    for (const data of pagesToKeep) tasks.push(...(data.tasks || []));
    if (completePageIndex >= 0) return { tasks, partial: false };
  }
  return { tasks, partial: true };
}

async function resolveSprintAssignments(sprintLists: ClickUpListLocation[], token: string) {
  const assignments: Array<{ sprint: ClickUpListLocation; taskIds: string[]; partial: boolean; failed: boolean }> = [];
  const concurrency = 4;
  for (let start = 0; start < sprintLists.length; start += concurrency) {
    const batch = sprintLists.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async sprint => {
      try {
        const result = await getListTasks(sprint.id, token, { includeTiml: true, pageLimit: 20, batchSize: 1 });
        const taskIds = Array.from(new Set(result.tasks.map(task => safeText(task.id)).filter(Boolean)));
        return { sprint, taskIds, partial: result.partial, failed: false };
      } catch {
        return { sprint, taskIds: [], partial: true, failed: true };
      }
    }));
    assignments.push(...results);
  }
  return assignments;
}

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") || "";
    const snapshot = await readSnapshot();
    if (!refresh && snapshot?.schemaVersion === SNAPSHOT_VERSION) return Response.json({ ...snapshot, cacheSource: "snapshot" }, { headers: { "Cache-Control": "private, no-store" } });

    const token = process.env.CLICKUP_API_TOKEN;
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
    if (!token || !workspaceId) return Response.json({ error: "ClickUp API тохиргоо дутуу байна." }, { status: 503 });

    const needsTaskSchemaRefresh = !refresh && snapshot && snapshot.schemaVersion !== SNAPSHOT_VERSION;
    const refreshSprints = refresh === "sprints" || refresh === "recent-sprints" || (!refresh && snapshot && Array.isArray(snapshot.tasks) && !needsTaskSchemaRefresh);
    if (refreshSprints && snapshot && Array.isArray(snapshot.tasks)) {
      const discovery = await resolveB2cWorkspace(workspaceId, token);
      const recentOnly = refresh === "recent-sprints" && snapshot.schemaVersion === SNAPSHOT_VERSION;
      const sprintLists = recentOnly ? discovery.sprintLists.slice(0, 4) : discovery.sprintLists;
      const rawSprintAssignments = await resolveSprintAssignments(sprintLists, token);
      const snapshotTasks = scopeDevReportTasks(snapshot.tasks as DevTask[]);
      const masterTaskIds = new Set(snapshotTasks.map(task => safeText(task.id)).filter(Boolean));
      const sprintAssignments = rawSprintAssignments.map(assignment => ({ ...assignment, taskIds: assignment.taskIds.filter(taskId => masterTaskIds.has(taskId)) }));
      const sprintIdsByTaskId = new Map<string, string[]>();
      for (const assignment of sprintAssignments) {
        for (const taskId of assignment.taskIds) sprintIdsByTaskId.set(taskId, [...(sprintIdsByTaskId.get(taskId) || []), assignment.sprint.id]);
      }
      const refreshedSprintIds = new Set(sprintAssignments.filter(assignment => !assignment.failed).map(assignment => assignment.sprint.id));
      const failedSprintIds = new Set(sprintAssignments.filter(assignment => assignment.failed).map(assignment => assignment.sprint.id));
      const previousSprints = Array.isArray(snapshot.sprints) ? snapshot.sprints as Array<{ id?: string; name?: string; folder?: string; startDate?: string | null; endDate?: string | null; taskCount?: number; partial?: boolean }> : [];
      const refreshedSprints = sprintAssignments.filter(assignment => !assignment.failed && assignment.taskIds.length).map(({ sprint, taskIds, partial }) => ({
        id: sprint.id,
        name: sprint.name,
        folder: sprint.folder,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        taskCount: taskIds.length,
        partial,
      }));
      const sprints = [...refreshedSprints, ...previousSprints.filter(sprint => sprint.id && !refreshedSprintIds.has(sprint.id) && (recentOnly || failedSprintIds.has(sprint.id))).map(sprint => ({
        id: safeText(sprint.id),
        name: safeText(sprint.name),
        folder: safeText(sprint.folder),
        startDate: sprint.startDate || null,
        endDate: sprint.endDate || null,
        taskCount: Number(sprint.taskCount) || 0,
        partial: sprint.partial === true,
      }))].sort((a, b) => (b.startDate || b.endDate || "").localeCompare(a.startDate || a.endDate || "") || b.name.localeCompare(a.name, undefined, { numeric: true }));
      const sprintById = new Map(sprints.map(sprint => [sprint.id, sprint]));
      const tasks = snapshotTasks.map(task => {
        const previousIds = Array.isArray(task.sprintIds) ? task.sprintIds.filter(id => !refreshedSprintIds.has(id) && (recentOnly || failedSprintIds.has(id))) : [];
        const sprintIds = Array.from(new Set([...(sprintIdsByTaskId.get(safeText(task.id)) || []), ...previousIds])).sort((a, b) => sprints.findIndex(sprint => sprint.id === a) - sprints.findIndex(sprint => sprint.id === b));
        return { ...task, sprintIds, sprint: sprintById.get(sprintIds[0])?.name || safeText(task.sprint) };
      });
      const taskPartial = snapshot.taskPartial === true;
      const payload = {
        ...snapshot,
        schemaVersion: SNAPSHOT_VERSION,
        list: discovery.list,
        reportYear: DEV_REPORT_END_YEAR,
        reportYears: [DEV_REPORT_START_YEAR, DEV_REPORT_END_YEAR],
        tasks,
        sprints,
        availableFields: Array.from(new Set(tasks.flatMap(task => Object.keys(task.customFields)))).sort(),
        taskPartial,
        sprintSyncErrors: rawSprintAssignments.filter(assignment => assignment.failed).length + (recentOnly ? Number(snapshot.sprintSyncErrors) || 0 : 0),
        partial: taskPartial || rawSprintAssignments.some(assignment => assignment.partial) || sprints.some(sprint => sprint.partial),
        syncedAt: new Date().toISOString(),
      } satisfies SnapshotPayload;
      await saveSnapshot(payload);
      return Response.json({ ...payload, cacheSource: "clickup" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const storedList = snapshot?.list && typeof snapshot.list === "object" ? snapshot.list as { id?: string; name?: string } : null;
    const [workspaceData, list, customTaskTypeData] = await Promise.all([
      clickUpJson<{ teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }> }>("/team", token),
      storedList?.id ? Promise.resolve({ id: storedList.id, name: safeText(storedList.name, "B2C Master") }) : resolveB2cWorkspace(workspaceId, token).then(result => result.list),
      clickUpJson<{ custom_items?: ClickUpCustomTaskType[] }>(`/team/${encodeURIComponent(workspaceId)}/custom_item`, token),
    ]);
    const taskResult = await getListTasks(list.id, token);
    const rawTasks = taskResult.tasks;
    const previousTasks = snapshot && Array.isArray(snapshot.tasks) ? snapshot.tasks as Array<{ id?: string; sprint?: string; sprintIds?: string[] }> : [];
    const previousSprintByTaskId = new Map(previousTasks.map(task => [safeText(task.id), { sprint: safeText(task.sprint), sprintIds: Array.isArray(task.sprintIds) ? task.sprintIds : [] }]));
    const sprints = snapshot && Array.isArray(snapshot.sprints) ? snapshot.sprints : [];
    const sprintIdsByTaskId = new Map<string, string[]>();
    for (const task of previousTasks) sprintIdsByTaskId.set(safeText(task.id), Array.isArray(task.sprintIds) ? task.sprintIds : []);
    const namesById = new Map(rawTasks.map(task => [safeText(task.id), safeText(task.name)]));
    const rawTasksById = new Map(rawTasks.map(task => [safeText(task.id), task]));
    const customTaskTypes = new Map<string, string>(
      (customTaskTypeData.custom_items || [])
        .map((item): [string, string] => [String(item.id), safeText(item.name)])
        .filter(([, name]) => Boolean(name)),
    );
    const tasks = scopeDevReportTasks(rawTasks.filter(task => task.id).map(task => {
      const fields = customFieldMap(task.custom_fields);
      const statusName = safeText(task.status?.status, "Тодорхойгүй");
      const parentTask = task.parent ? rawTasksById.get(task.parent) : undefined;
      const sprintIds = sprintIdsByTaskId.get(safeText(task.id)) || [];
      return {
        id: safeText(task.id),
        name: safeText(task.name, "Нэргүй ажил"),
        parentId: safeText(task.parent) || null,
        parentName: task.parent ? namesById.get(task.parent) || "" : "",
        url: safeText(task.url),
        status: { name: statusName, color: safeColor(task.status?.color, "#64748b"), type: safeText(task.status?.type), done: normalize(task.status?.type) === "closed" || /complete|closed|done|дууссан/.test(normalize(statusName)) },
        assignees: mapAssignees(task.assignees),
        tags: (task.tags || []).map(tag => safeText(tag.name)).filter(Boolean),
        type: resolveTaskType(task, fields, parentTask, customTaskTypes),
        sprint: previousSprintByTaskId.get(safeText(task.id))?.sprint || findField(fields, [/sprint/, /спринт/]),
        sprintIds,
        position: findField(fields, [/position/, /role/, /албан тушаал/]),
        project: findField(fields, [/project/, /website/, /domain/, /site/, /төсөл/, /вэб/]),
        dueDate: dateToIso(task.due_date),
        startDate: dateToIso(task.start_date),
        createdDate: dateToIso(task.date_created),
        updatedAt: timestampToIso(task.date_updated),
        closedDate: dateToIso(task.date_closed),
        timeEstimateMs: typeof task.time_estimate === "number" ? task.time_estimate : null,
        customFields: fields,
      };
    }));
    const workspace = workspaceData.teams?.find(team => team.id === workspaceId) || workspaceData.teams?.[0];
    const payload = {
      schemaVersion: SNAPSHOT_VERSION,
      workspace: { id: workspaceId, name: safeText(workspace?.name, "ClickUp Workspace"), color: safeColor(workspace?.color), memberCount: Array.isArray(workspace?.members) ? workspace.members.length : 0 },
      list,
      reportYear: DEV_REPORT_END_YEAR,
      reportYears: [DEV_REPORT_START_YEAR, DEV_REPORT_END_YEAR],
      tasks,
      sprints,
      taskPartial: taskResult.partial,
      sprintSyncErrors: Number(snapshot?.sprintSyncErrors) || 0,
      partial: taskResult.partial || (snapshot?.partial === true && snapshot?.taskPartial !== true),
      availableFields: Array.from(new Set(tasks.flatMap(task => Object.keys(task.customFields)))).sort(),
      availableTaskTypes: Array.from(new Set(["Task", "Milestone", ...customTaskTypes.values()])).sort(),
      syncedAt: new Date().toISOString(),
    } satisfies SnapshotPayload;

    await saveSnapshot(payload);
    return Response.json({ ...payload, cacheSource: "clickup" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Dev ClickUp refresh failed", error);
    const message = error instanceof Error && error.message === "B2C Master list олдсонгүй." ? error.message : "B2C Master list-ийн ClickUp мэдээллийг татаж чадсангүй.";
    return Response.json({ error: message }, { status: 502 });
  }
}
