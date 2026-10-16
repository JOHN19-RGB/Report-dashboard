import { readClickUpSnapshot, saveClickUpSnapshot, type ClickUpSnapshot } from "../../../db/clickup-snapshot";
import { proxyClickUpForLocalDevelopment } from "../../lib/clickup-local-proxy";
import { requestClickUp } from "../../lib/clickup-request";
import { mapWithConcurrency, readClickUpTaskPages, shareInFlightResponse } from "../../lib/clickup-pagination";
import { CLICKUP_DELTA_OVERLAP_MS, mergeCxDelta, reportMonthWindows, shouldRunCxDeltaSync } from "../../lib/clickup-cx-sync";

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
  status?: { status?: string; color?: string; type?: string };
  assignees?: ClickUpUser[];
  due_date?: string | null;
  time_estimate?: number | null;
  custom_fields?: ClickUpCustomField[];
};

const CX_DEV_TEAM_LIST_ID = "901804865220";
const TYPE_FIELD_ID = "71ce5c62-1c3c-4dd5-9d70-84dc6933f55f";
const REPORT_YEAR = 2026;
const CX_TEAM_MEMBERS = ["Ариунгэрэл", "Байгалмаа", "Мишээл", "Энхбат"];
const SNAPSHOT_ID = 1;

async function readSnapshot() {
  return readClickUpSnapshot(SNAPSHOT_ID);
}

async function saveSnapshot(payload: ClickUpSnapshot) {
  return saveClickUpSnapshot(SNAPSHOT_ID, payload);
}

function safeColor(value: unknown, fallback = "#64748b") {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function mapAssignees(users: ClickUpUser[] | undefined) {
  return (users || []).map((user) => ({
    id: user.id || null,
    name: safeText(user.username, "Тодорхойгүй"),
    color: safeColor(user.color),
    avatar: safeText(user.profilePicture) || null,
  }));
}

function resolveType(task: ClickUpTask) {
  const field = (task.custom_fields || []).find(
    (item) => item.id === TYPE_FIELD_ID || safeText(item.name).trim().toLocaleLowerCase() === "type",
  );
  if (!field || field.value == null) return null;

  const value = field.value;
  const option = (field.type_config?.options || []).find(
    (item) => item.id === String(value) || item.orderindex === Number(value),
  );
  if (!option?.name) return null;

  return {
    name: safeText(option.name).trim(),
    color: safeColor(option.color, "#7b68ee"),
  };
}

const CX_REQUEST_OPTIONS = { timeoutMs: 50_000 };

async function clickUpFetch(path: string, token: string) {
  return requestClickUp(path, token, fetch, undefined, CX_REQUEST_OPTIONS);
}

type TaskPage = { tasks?: ClickUpTask[]; last_page?: boolean };

async function readListPages(label: string, token: string, buildQuery: (page: number) => URLSearchParams) {
  return readClickUpTaskPages<ClickUpTask>(async page => {
    const response = await clickUpFetch(`/list/${CX_DEV_TEAM_LIST_ID}/task?${buildQuery(page)}`, token);
    if (!response.ok) throw new Error(`ClickUp ${label} page ${page} failed: ${response.status}`);
    return response.json() as Promise<TaskPage>;
  }, { batchSize: 1 });
}

function getDailyTaskParents(token: string) {
  return readListPages("parent", token, page => {
    const query = new URLSearchParams({ include_closed: "true", subtasks: "true", include_timl: "true", page: String(page) });
    query.append("statuses[]", "daily task");
    return query;
  });
}

/** One heavy year-wide query timed out on ClickUp; monthly windows stay small and run two at a time. */
async function getCompletedSubtasks(token: string) {
  const windows = await mapWithConcurrency(reportMonthWindows(REPORT_YEAR), 2, ({ start, end }) =>
    readListPages(`subtask ${new Date(start).toISOString().slice(0, 7)}`, token, page => {
      const query = new URLSearchParams({
        page: String(page),
        order_by: "due_date",
        reverse: "true",
        subtasks: "true",
        include_closed: "true",
        due_date_gt: String(start - 1),
        due_date_lt: String(end),
      });
      query.append("statuses[]", "complete");
      return query;
    }),
  );
  return { tasks: windows.flatMap(window => window.tasks), partial: windows.some(window => window.partial) };
}

function getUpdatedTasks(token: string, since: number) {
  return readListPages("delta", token, page => new URLSearchParams({
    page: String(page),
    subtasks: "true",
    include_closed: "true",
    include_timl: "true",
    date_updated_gt: String(since),
  }));
}

type ParentRow = { id: string; name: string; assignees: ReturnType<typeof mapAssignees> };

function mapParent(task: ClickUpTask): ParentRow {
  return { id: safeText(task.id), name: safeText(task.name, "Daily Task"), assignees: mapAssignees(task.assignees) };
}

function mapSubtask(task: ClickUpTask, parent: ParentRow) {
  const taskAssignees = mapAssignees(task.assignees);
  return {
    id: safeText(task.id),
    name: safeText(task.name),
    parentId: parent.id,
    parentName: parent.name,
    assignment: taskAssignees.length > 0 ? taskAssignees : parent.assignees,
    status: {
      name: safeText(task.status?.status, "complete"),
      color: safeColor(task.status?.color, "#168c80"),
      type: safeText(task.status?.type),
    },
    type: resolveType(task),
    dueDate: task.due_date || null,
    timeEstimate: task.time_estimate || null,
  };
}

type SubtaskRow = ReturnType<typeof mapSubtask>;

function buildReport(workspace: ClickUpSnapshot["workspace"], parentRows: ParentRow[], subtaskRows: SubtaskRow[]) {
  const parentById = new Map(parentRows.map(parent => [parent.id, parent]));
  const countByParent = new Map<string, number>();
  const subtasks = subtaskRows
    .filter(task => parentById.has(task.parentId))
    .map(task => ({ ...task, parentName: parentById.get(task.parentId)!.name }))
    .sort((a, b) => Number(b.dueDate || 0) - Number(a.dueDate || 0));
  for (const task of subtasks) countByParent.set(task.parentId, (countByParent.get(task.parentId) || 0) + 1);

  const parents = parentRows.map(parent => ({
    id: parent.id,
    name: parent.name,
    assignees: parent.assignees,
    completedCount: countByParent.get(parent.id) || 0,
    fetchedCount: countByParent.get(parent.id) || 0,
    fetched: true,
  }));

  const peopleMap = new Map<
    string,
    {
      id: string;
      name: string;
      color: string;
      avatar: string | null;
      parentIds: Set<string>;
      completeSubtasks: number;
      withType: number;
      withEstimate: number;
      estimateMs: number;
    }
  >();
  const personByParent = new Map<string, string>();

  for (const parent of parents) {
    const owner = parent.assignees[0];
    if (!owner?.name || !CX_TEAM_MEMBERS.includes(owner.name)) continue;
    const id = String(owner.id || owner.name);
    const person = peopleMap.get(id) || {
      id,
      name: owner.name,
      color: owner.color,
      avatar: owner.avatar,
      parentIds: new Set<string>(),
      completeSubtasks: 0,
      withType: 0,
      withEstimate: 0,
      estimateMs: 0,
    };
    person.parentIds.add(parent.id);
    personByParent.set(parent.id, id);
    peopleMap.set(id, person);
  }

  for (const task of subtasks) {
    const person = peopleMap.get(personByParent.get(task.parentId) || "");
    if (!person) continue;
    person.completeSubtasks += 1;
    person.withType += task.type ? 1 : 0;
    person.withEstimate += task.timeEstimate ? 1 : 0;
    person.estimateMs += task.timeEstimate || 0;
  }

  const people = Array.from(peopleMap.values())
    .map(person => ({
      ...person,
      parentIds: Array.from(person.parentIds),
    }))
    .sort((a, b) => CX_TEAM_MEMBERS.indexOf(a.name) - CX_TEAM_MEMBERS.indexOf(b.name));

  return {
    workspace,
    list: { id: CX_DEV_TEAM_LIST_ID, name: "CX Dev.Team" },
    reportYear: REPORT_YEAR,
    people,
    parents,
    subtasks,
    summary: {
      dailyTaskParents: parents.length,
      completeSubtasks: subtasks.length,
      withType: subtasks.filter(task => task.type).length,
      withEstimate: subtasks.filter(task => task.timeEstimate).length,
      estimateMs: subtasks.reduce((sum, task) => sum + (task.timeEstimate || 0), 0),
    },
    dataQuality: {
      missingAssignment: subtasks.filter(task => task.assignment.length === 0).length,
      missingStatus: subtasks.filter(task => !task.status.name).length,
      missingType: subtasks.filter(task => !task.type).length,
      missingDueDate: subtasks.filter(task => !task.dueDate).length,
      missingTimeEstimate: subtasks.filter(task => !task.timeEstimate).length,
    },
  };
}

async function fullSync(token: string) {
  const [teamsResponse, parentPageResult, completedSubtaskResult] = await Promise.all([
    clickUpFetch("/team", token),
    getDailyTaskParents(token),
    getCompletedSubtasks(token),
  ]);
  if (!teamsResponse.ok) throw new Error(`ClickUp workspace request failed: ${teamsResponse.status}`);

  const teamsData = (await teamsResponse.json()) as {
    teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }>;
  };
  const configuredWorkspace = process.env.CLICKUP_WORKSPACE_ID;
  const team = teamsData.teams?.find(item => item.id === configuredWorkspace) || teamsData.teams?.[0];
  if (!team?.id) throw new Error("No accessible ClickUp workspace");
  const workspace = {
    id: team.id,
    name: safeText(team.name, "ClickUp Workspace"),
    color: safeColor(team.color, "#7b68ee"),
    memberCount: Array.isArray(team.members) ? team.members.length : 0,
  };

  const parentRows = parentPageResult.tasks.filter(task => task.id).map(mapParent);
  const parentById = new Map(parentRows.map(parent => [parent.id, parent]));
  const subtaskRows = completedSubtaskResult.tasks.flatMap(task => {
    const parent = parentById.get(safeText(task.parent));
    return parent ? [mapSubtask(task, parent)] : [];
  });
  const syncedAt = new Date().toISOString();
  return {
    ...buildReport(workspace, parentRows, subtaskRows),
    partial: parentPageResult.partial || completedSubtaskResult.partial,
    syncMode: "full",
    fullSyncedAt: syncedAt,
    syncedAt,
  } satisfies ClickUpSnapshot;
}

async function deltaSync(token: string, snapshot: ClickUpSnapshot) {
  const since = Date.parse(snapshot.syncedAt) - CLICKUP_DELTA_OVERLAP_MS;
  const delta = await getUpdatedTasks(token, since);
  if (delta.partial) return null;
  const merged = mergeCxDelta(
    (snapshot.parents as ParentRow[]).map(({ id, name, assignees }) => ({ id, name, assignees })),
    snapshot.subtasks as SubtaskRow[],
    delta.tasks,
    { year: REPORT_YEAR, mapParent, mapSubtask },
  );
  return {
    ...buildReport(snapshot.workspace, merged.parents, merged.subtasks),
    partial: snapshot.partial === true,
    syncMode: "delta",
    deltaTaskCount: delta.tasks.length,
    fullSyncedAt: snapshot.fullSyncedAt,
    syncedAt: new Date().toISOString(),
  } satisfies ClickUpSnapshot;
}

async function sync(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const refresh = params.get("refresh") === "1";
    const snapshot = await readSnapshot();
    if (!refresh && snapshot) {
      return Response.json({ ...snapshot, cacheSource: "snapshot" }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const token = process.env.CLICKUP_API_TOKEN;
    if (!token) {
      const proxyResponse = await proxyClickUpForLocalDevelopment(request, "/api/clickup", SNAPSHOT_ID);
      if (proxyResponse) return proxyResponse;
      return Response.json({ error: "ClickUp API тохиргоо хийгдээгүй байна." }, { status: 503 });
    }

    const payload = (params.get("full") !== "1" && snapshot && shouldRunCxDeltaSync(snapshot) && await deltaSync(token, snapshot)) || await fullSync(token);

    // Never replace the last complete report with a truncated refresh.
    if (!payload.partial) await saveSnapshot(payload);

    return Response.json({ ...payload, cacheSource: "clickup" }, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("CX ClickUp sync failed", error);
    const detail = process.env.NODE_ENV === "development" && error instanceof Error ? { detail: error.message } : {};
    return Response.json({ error: "ClickUp API-тай холбогдоход алдаа гарлаа.", ...detail }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return shareInFlightResponse(`cx:${params.get("refresh") || ""}:${params.get("full") || ""}`, () => sync(request));
}
