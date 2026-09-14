import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clickUpSnapshots } from "../../../../db/schema";

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
  due_date?: string | null;
  start_date?: string | null;
  date_created?: string | null;
  date_closed?: string | null;
  time_estimate?: number | null;
  custom_fields?: ClickUpCustomField[];
};

type ClickUpList = { id?: string; name?: string };
type SnapshotPayload = Record<string, unknown> & { syncedAt: string };

const SNAPSHOT_ID = 2;
const REPORT_YEAR = 2026;

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
  const [row] = await getDb().select().from(clickUpSnapshots).where(eq(clickUpSnapshots.id, SNAPSHOT_ID)).limit(1);
  return row ? decodeSnapshot(row.payload) : null;
}

async function saveSnapshot(payload: SnapshotPayload) {
  const encoded = await encodeSnapshot(payload);
  await getDb().insert(clickUpSnapshots).values({ id: SNAPSHOT_ID, payload: encoded, syncedAt: payload.syncedAt }).onConflictDoUpdate({
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
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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

function resolveTaskType(fields: Record<string, string>, status: string, parentStatus = "") {
  const customType = findField(fields, [/^type$/, /^task type$/, /төрөл/]);
  return knownTaskType(customType) || knownTaskType(status) || knownTaskType(parentStatus) || customType || "Тодорхойгүй";
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

async function resolveB2cMasterList(workspaceId: string, token: string) {
  const configuredListId = process.env.CLICKUP_B2C_MASTER_LIST_ID;
  if (configuredListId) {
    const list = await clickUpJson<ClickUpList>(`/list/${encodeURIComponent(configuredListId)}`, token);
    if (list.id) return { id: list.id, name: safeText(list.name, "B2C Master") };
  }

  const spacesData = await clickUpJson<{ spaces?: Array<{ id?: string; name?: string }> }>(`/team/${encodeURIComponent(workspaceId)}/space?archived=false`, token);
  const candidates: Array<{ id: string; name: string; space: string; folder: string }> = [];

  await Promise.all((spacesData.spaces || []).map(async space => {
    if (!space.id) return;
    const [foldersData, listsData] = await Promise.all([
      clickUpJson<{ folders?: Array<{ id?: string; name?: string; lists?: ClickUpList[] }> }>(`/space/${encodeURIComponent(space.id)}/folder?archived=false`, token),
      clickUpJson<{ lists?: ClickUpList[] }>(`/space/${encodeURIComponent(space.id)}/list?archived=false`, token),
    ]);
    for (const list of listsData.lists || []) {
      if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: "" });
    }
    for (const folder of foldersData.folders || []) {
      for (const list of folder.lists || []) {
        if (list.id) candidates.push({ id: list.id, name: safeText(list.name), space: safeText(space.name), folder: safeText(folder.name) });
      }
    }
  }));

  const scored = candidates.map(candidate => {
    const listName = normalize(candidate.name);
    const hierarchy = normalize(`${candidate.space} ${candidate.folder} ${candidate.name}`);
    const score = (listName === "b2c master" ? 100 : 0) + (listName.includes("b2c") ? 35 : 0) + (listName.includes("master") ? 30 : 0) + (hierarchy.includes("b2c") ? 12 : 0) + (hierarchy.includes("master") ? 8 : 0);
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score < 50) throw new Error("B2C Master list олдсонгүй.");
  return { id: scored[0].id, name: scored[0].name || "B2C Master" };
}

async function getListTasks(listId: string, token: string) {
  const tasks: ClickUpTask[] = [];
  const pageLimit = 100;
  const batchSize = 5;
  for (let batchStart = 0; batchStart < pageLimit; batchStart += batchSize) {
    const pages = await Promise.all(Array.from({ length: batchSize }, async (_, offset) => {
      const page = batchStart + offset;
      const query = new URLSearchParams({ archived: "false", include_closed: "true", subtasks: "true", page: String(page), order_by: "due_date", reverse: "true" });
      return clickUpJson<{ tasks?: ClickUpTask[]; last_page?: boolean }>(`/list/${encodeURIComponent(listId)}/task?${query}`, token);
    }));
    const completePageIndex = pages.findIndex(data => data.last_page === true || (data.tasks || []).length < 100);
    const pagesToKeep = completePageIndex >= 0 ? pages.slice(0, completePageIndex + 1) : pages;
    for (const data of pagesToKeep) tasks.push(...(data.tasks || []));
    if (completePageIndex >= 0) return { tasks, partial: false };
  }
  return { tasks, partial: true };
}

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!refresh) {
      const snapshot = await readSnapshot();
      if (snapshot) return Response.json({ ...snapshot, cacheSource: "snapshot" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const token = process.env.CLICKUP_API_TOKEN;
    const workspaceId = process.env.CLICKUP_WORKSPACE_ID;
    if (!token || !workspaceId) return Response.json({ error: "ClickUp API тохиргоо дутуу байна." }, { status: 503 });

    const [workspaceData, list] = await Promise.all([
      clickUpJson<{ teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }> }>("/team", token),
      resolveB2cMasterList(workspaceId, token),
    ]);
    const taskResult = await getListTasks(list.id, token);
    const rawTasks = taskResult.tasks;
    const namesById = new Map(rawTasks.map(task => [safeText(task.id), safeText(task.name)]));
    const rawTasksById = new Map(rawTasks.map(task => [safeText(task.id), task]));
    const tasks = rawTasks.filter(task => task.id).map(task => {
      const fields = customFieldMap(task.custom_fields);
      const statusName = safeText(task.status?.status, "Тодорхойгүй");
      const parentStatus = task.parent ? safeText(rawTasksById.get(task.parent)?.status?.status) : "";
      return {
        id: safeText(task.id),
        name: safeText(task.name, "Нэргүй ажил"),
        parentId: safeText(task.parent) || null,
        parentName: task.parent ? namesById.get(task.parent) || "" : "",
        url: safeText(task.url),
        status: { name: statusName, color: safeColor(task.status?.color, "#64748b"), type: safeText(task.status?.type), done: normalize(task.status?.type) === "closed" || /complete|closed|done|дууссан/.test(normalize(statusName)) },
        assignees: mapAssignees(task.assignees),
        type: resolveTaskType(fields, statusName, parentStatus),
        sprint: findField(fields, [/sprint/, /спринт/]),
        position: findField(fields, [/position/, /role/, /албан тушаал/]),
        project: findField(fields, [/project/, /website/, /domain/, /site/, /төсөл/, /вэб/]),
        dueDate: dateToIso(task.due_date),
        startDate: dateToIso(task.start_date),
        createdDate: dateToIso(task.date_created),
        closedDate: dateToIso(task.date_closed),
        timeEstimateMs: typeof task.time_estimate === "number" ? task.time_estimate : null,
        customFields: fields,
      };
    });
    const workspace = workspaceData.teams?.find(team => team.id === workspaceId) || workspaceData.teams?.[0];
    const payload = {
      workspace: { id: workspaceId, name: safeText(workspace?.name, "ClickUp Workspace"), color: safeColor(workspace?.color), memberCount: Array.isArray(workspace?.members) ? workspace.members.length : 0 },
      list,
      reportYear: REPORT_YEAR,
      tasks,
      partial: taskResult.partial,
      availableFields: Array.from(new Set(tasks.flatMap(task => Object.keys(task.customFields)))).sort(),
      syncedAt: new Date().toISOString(),
    } satisfies SnapshotPayload;

    await saveSnapshot(payload);
    return Response.json({ ...payload, cacheSource: "clickup" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message === "B2C Master list олдсонгүй." ? error.message : "B2C Master list-ийн ClickUp мэдээллийг татаж чадсангүй.";
    return Response.json({ error: message }, { status: 502 });
  }
}
