import { readClickUpSnapshot, saveClickUpSnapshot, type ClickUpSnapshot } from "../../../../db/clickup-snapshot";
import { proxyClickUpForLocalDevelopment } from "../../../lib/clickup-local-proxy";
import { DEV_REPORT_END_YEAR, DEV_REPORT_START_YEAR, scopeDevReportTasks, type DevSprint, type DevTask } from "../../../lib/dev-report";
import { requestClickUp } from "../../../lib/clickup-request";
import { mergeClickUpTaskSnapshot, readClickUpTaskPages } from "../../../lib/clickup-pagination";
import { mergeSprintMemberships, type SprintAssignment, type SprintSyncState } from "../../../lib/clickup-sprint-sync";

export const maxDuration = 300;

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
const SNAPSHOT_ID = 2;
const SNAPSHOT_VERSION = 8;
const reportDateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" });

async function readSnapshot() {
  return readClickUpSnapshot(SNAPSHOT_ID);
}

async function saveSnapshot(payload: ClickUpSnapshot) {
  return saveClickUpSnapshot(SNAPSHOT_ID, payload);
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
  const parts = reportDateFormatter.formatToParts(date);
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
  return requestClickUp(path, token);
}

async function clickUpJson<T>(path: string, token: string) {
  const response = await clickUpFetch(path, token);
  if (!response.ok) throw new Error(`ClickUp request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function discoverWorkspaceLists(workspaceId: string, token: string) {
  const spacesData = await clickUpJson<{ spaces?: Array<{ id?: string; name?: string }> }>(`/team/${encodeURIComponent(workspaceId)}/space?archived=false`, token);
  const candidates: ClickUpListLocation[] = [];
  let partial = false;

  await Promise.all((spacesData.spaces || []).map(async space => {
    if (!space.id) return;
    const [foldersData, listsData] = await Promise.all([
      clickUpJson<{ folders?: Array<{ id?: string; name?: string; lists?: ClickUpList[] }> }>(`/space/${encodeURIComponent(space.id)}/folder?archived=false`, token).catch((error) => {
        partial = true;
        console.warn(`ClickUp folders are unavailable for space ${space.id}; continuing`, error);
        return { folders: [] };
      }),
      clickUpJson<{ lists?: ClickUpList[] }>(`/space/${encodeURIComponent(space.id)}/list?archived=false`, token).catch((error) => {
        partial = true;
        console.warn(`ClickUp folderless lists are unavailable for space ${space.id}; continuing`, error);
        return { lists: [] };
      }),
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
    const archivedLists = await Promise.all(sprintFolders.map(folder => clickUpJson<{ lists?: ClickUpList[] }>(`/folder/${encodeURIComponent(folder.id!)}/list?archived=true`, token).then(data => ({ folder, lists: data.lists || [] })).catch(() => {
      partial = true;
      return { folder, lists: [] as ClickUpList[] };
    })));
    for (const result of archivedLists) {
      for (const list of result.lists) {
        if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: safeText(result.folder.name), startDate: dateToIso(list.start_date), endDate: dateToIso(list.due_date), taskCount: Number(list.task_count) || 0 });
      }
    }
  }));

  return { candidates: Array.from(new Map(candidates.map(candidate => [candidate.id, candidate])).values()), partial };
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
  const { candidates, partial } = await discoverWorkspaceLists(workspaceId, token);
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
  const sprintCandidates = candidates
    .filter(candidate => candidate.id !== list.id && isSprintList(candidate))
    .filter(candidate => !candidate.startDate || !candidate.endDate || (candidate.startDate <= reportEnd && candidate.endDate >= reportStart));
  const explicitB2cSprintLists = sprintCandidates.filter(candidate => {
    const hierarchy = normalize(`${candidate.space} ${candidate.folder} ${candidate.name}`);
    return /(^|\s)b2c(\s|$)/.test(hierarchy);
  });
  const sprintLists = (explicitB2cSprintLists.length ? explicitB2cSprintLists : sprintCandidates)
    .sort((a, b) => (b.startDate || b.endDate || "").localeCompare(a.startDate || a.endDate || "") || b.name.localeCompare(a.name, undefined, { numeric: true }));
  return { list, sprintLists, partial };
}

async function getListTasks(listId: string, token: string, options: { includeTiml?: boolean; pageLimit?: number; batchSize?: number } = {}) {
  return readClickUpTaskPages<ClickUpTask>(async page => {
      const query = new URLSearchParams({ archived: "false", include_closed: "true", subtasks: "true", include_timl: options.includeTiml ? "true" : "false", page: String(page), order_by: "due_date", reverse: "true" });
      return clickUpJson<{ tasks?: ClickUpTask[]; last_page?: boolean }>(`/list/${encodeURIComponent(listId)}/task?${query}`, token);
  }, options);
}

async function resolveSprintAssignments(sprintLists: ClickUpListLocation[], token: string) {
  const assignments: SprintAssignment[] = [];
  const concurrency = 2;
  for (let start = 0; start < sprintLists.length; start += concurrency) {
    const batch = sprintLists.slice(start, start + concurrency);
    const results = await Promise.all(batch.map(async sprint => {
      try {
        const result = await getListTasks(sprint.id, token, { includeTiml: true, batchSize: 1 });
        const taskIds = Array.from(new Set(result.tasks.map(task => safeText(task.id)).filter(Boolean)));
        return { sprint, taskIds, partial: result.partial, failed: false };
      } catch (error) {
        return { sprint, taskIds: [], partial: true, failed: true, error: error instanceof Error ? error.message : "ClickUp sprint request failed" };
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
    if (!refresh && snapshot?.schemaVersion === SNAPSHOT_VERSION) return Response.json({ ...snapshot, partial: Boolean(snapshot.partial || snapshot.sprintNeedsFullRefresh || !Array.isArray(snapshot.sprints) || !snapshot.sprints.length), cacheSource: "snapshot" }, { headers: { "Cache-Control": "private, no-store" } });

    const token = process.env.CLICKUP_API_TOKEN;
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
    if (!token || !workspaceId) {
      const proxyResponse = await proxyClickUpForLocalDevelopment(request, "/api/clickup/dev", SNAPSHOT_ID);
      if (proxyResponse) return proxyResponse;
      return Response.json({ error: "ClickUp API тохиргоо дутуу байна." }, { status: 503 });
    }

    const needsTaskSchemaRefresh = !refresh && snapshot && snapshot.schemaVersion !== SNAPSHOT_VERSION;
    const refreshSprints = refresh === "sprints" || refresh === "recent-sprints" || (!refresh && snapshot && Array.isArray(snapshot.tasks) && !needsTaskSchemaRefresh);
    if (refreshSprints && snapshot && Array.isArray(snapshot.tasks)) {
      const discovery = await resolveB2cWorkspace(workspaceId, token);
      const hasSprintHistory = Array.isArray(snapshot.sprints) && snapshot.sprints.length > 0;
      const recentOnly = refresh === "recent-sprints" && snapshot.schemaVersion === SNAPSHOT_VERSION && hasSprintHistory && snapshot.sprintNeedsFullRefresh !== true && !snapshot.sprintSyncErrors;
      const previousState = snapshot.sprintSyncState && typeof snapshot.sprintSyncState === "object" ? snapshot.sprintSyncState as Record<string, SprintSyncState> : {};
      // Include newly discovered lists even if their dates place them outside the latest four.
      const sprintLists = recentOnly ? discovery.sprintLists.filter((sprint, index) => index < 4 || !previousState[sprint.id]) : discovery.sprintLists;
      const rawSprintAssignments = await resolveSprintAssignments(sprintLists, token);
      const snapshotTasks = scopeDevReportTasks(snapshot.tasks as DevTask[]);
      const previousSprints = Array.isArray(snapshot.sprints) ? snapshot.sprints as DevSprint[] : [];
      const { tasks, sprints, state } = mergeSprintMemberships(snapshotTasks, previousSprints, rawSprintAssignments, previousState);
      const taskPartial = snapshot.taskPartial === true;
      const sprintSyncErrors = Object.values(state).filter(item => item.failed).length;
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
        sprintSyncState: state,
        sprintSyncErrors,
        sprintNeedsFullRefresh: discovery.partial || sprintSyncErrors > 0 || Object.values(state).some(item => item.partial),
        sprintDiscoveryPartial: discovery.partial,
        sprintDiscoveryCount: discovery.sprintLists.length,
        partial: taskPartial || discovery.partial || Object.values(state).some(item => item.partial || item.failed),
        taskSyncedAt: snapshot.taskSyncedAt || snapshot.syncedAt,
        sprintSyncedAt: new Date().toISOString(),
        syncedAt: snapshot.taskSyncedAt as string || snapshot.syncedAt,
      } satisfies ClickUpSnapshot;
      await saveSnapshot(payload);
      return Response.json({ ...payload, cacheSource: "clickup" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const storedList = snapshot?.list && typeof snapshot.list === "object" ? snapshot.list as { id?: string; name?: string } : null;
    const [workspaceData, list, customTaskTypeData] = await Promise.all([
      clickUpJson<{ teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }> }>("/team", token),
      storedList?.id ? Promise.resolve({ id: storedList.id, name: safeText(storedList.name, "B2C Master") }) : resolveB2cWorkspace(workspaceId, token).then(result => result.list),
      clickUpJson<{ custom_items?: ClickUpCustomTaskType[] }>(`/team/${encodeURIComponent(workspaceId)}/custom_item`, token).catch((error) => {
        if (Array.isArray(snapshot?.customTaskTypeDefinitions)) return { custom_items: snapshot.customTaskTypeDefinitions as ClickUpCustomTaskType[] };
        throw error;
      }),
    ]);
    const taskResult = await getListTasks(list.id, token, { includeTiml: true });
    const rawTasks = Array.from(new Map(taskResult.tasks.filter(task => task.id).map(task => [task.id, task])).values());
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
    const mappedTasks: DevTask[] = rawTasks.filter(task => task.id).map(task => {
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
    });
    const tasks = scopeDevReportTasks(mergeClickUpTaskSnapshot(Array.isArray(snapshot?.tasks) ? snapshot.tasks as DevTask[] : [], mappedTasks, taskResult.partial));
    const workspace = workspaceData.teams?.find(team => team.id === workspaceId) || workspaceData.teams?.[0];
    const payload = {
      schemaVersion: SNAPSHOT_VERSION,
      workspace: { id: workspaceId, name: safeText(workspace?.name, "ClickUp Workspace"), color: safeColor(workspace?.color), memberCount: Array.isArray(workspace?.members) ? workspace.members.length : 0 },
      list,
      reportYear: DEV_REPORT_END_YEAR,
      reportYears: [DEV_REPORT_START_YEAR, DEV_REPORT_END_YEAR],
      tasks,
      sprints,
      sprintSyncState: snapshot?.sprintSyncState || {},
      sprintDiscoveryPartial: snapshot?.sprintDiscoveryPartial === true,
      sprintNeedsFullRefresh: snapshot?.sprintNeedsFullRefresh === true || !snapshot?.masterIncludesTiml || tasks.some(task => !previousSprintByTaskId.has(task.id)),
      masterIncludesTiml: true,
      masterFetchedTaskCount: rawTasks.length,
      taskPartial: taskResult.partial,
      sprintSyncErrors: Number(snapshot?.sprintSyncErrors) || 0,
      partial: taskResult.partial || !sprints.length || (snapshot?.partial === true && snapshot?.taskPartial !== true),
      availableFields: Array.from(new Set(tasks.flatMap(task => Object.keys(task.customFields)))).sort(),
      availableTaskTypes: Array.from(new Set(["Task", "Milestone", ...customTaskTypes.values()])).sort(),
      customTaskTypeDefinitions: customTaskTypeData.custom_items || [],
      taskSyncedAt: new Date().toISOString(),
      sprintSyncedAt: snapshot?.sprintSyncedAt || (sprints.length ? snapshot?.syncedAt : null),
      syncedAt: new Date().toISOString(),
    } satisfies ClickUpSnapshot;

    await saveSnapshot(payload);
    return Response.json({ ...payload, cacheSource: "clickup" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Dev ClickUp refresh failed", error);
    const message = error instanceof Error && error.message === "B2C Master list олдсонгүй." ? error.message : "B2C Master list-ийн ClickUp мэдээллийг татаж чадсангүй.";
    return Response.json({ error: message }, { status: 502 });
  }
}
