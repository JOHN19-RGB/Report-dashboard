import { readClickUpSnapshot, saveClickUpSnapshot, type ClickUpSnapshot } from "../../../db/clickup-snapshot";

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

async function clickUpFetch(path: string, token: string) {
  return fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    cache: "no-store",
  });
}

async function getCompletedSubtasks(parentId: string, workspaceId: string, token: string) {
  const tasks: ClickUpTask[] = [];
  const reportStart = Date.UTC(REPORT_YEAR, 0, 1);
  const reportEnd = Date.UTC(REPORT_YEAR + 1, 0, 1);

  for (let page = 0; page < 25; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      order_by: "due_date",
      reverse: "true",
      subtasks: "true",
      include_closed: "true",
      parent: parentId,
      due_date_gt: String(reportStart - 1),
      due_date_lt: String(reportEnd),
    });
    query.append("statuses[]", "complete");
    query.append("list_ids[]", CX_DEV_TEAM_LIST_ID);

    const response = await clickUpFetch(`/team/${encodeURIComponent(workspaceId)}/task?${query}`, token);
    if (!response.ok) throw new Error(`ClickUp subtask page failed: ${response.status}`);

    const data = (await response.json()) as { tasks?: ClickUpTask[]; last_page?: boolean };
    const pageTasks = data.tasks || [];
    tasks.push(...pageTasks);
    if (data.last_page === true || pageTasks.length < 100) break;
  }

  return tasks;
}

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    if (!refresh) {
      const snapshot = await readSnapshot();
      if (snapshot) {
        return Response.json({ ...snapshot, cacheSource: "snapshot" }, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }

    const token = process.env.CLICKUP_API_TOKEN;
    if (!token) {
      return Response.json({ error: "ClickUp API тохиргоо хийгдээгүй байна." }, { status: 503 });
    }

    const parentQuery = new URLSearchParams({
      include_closed: "true",
      subtasks: "true",
      page: "0",
    });
    parentQuery.append("statuses[]", "daily task");

    const [teamsResponse, parentsResponse] = await Promise.all([
      clickUpFetch("/team", token),
      clickUpFetch(`/list/${CX_DEV_TEAM_LIST_ID}/task?${parentQuery}`, token),
    ]);

    if (!teamsResponse.ok) {
      return Response.json({ error: "ClickUp workspace мэдээлэл татаж чадсангүй." }, { status: teamsResponse.status });
    }
    if (!parentsResponse.ok) {
      return Response.json({ error: "CX Dev.Team-ийн Daily Task мэдээлэл татаж чадсангүй." }, { status: parentsResponse.status });
    }

    const teamsData = (await teamsResponse.json()) as {
      teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }>;
    };
    const configuredWorkspace = process.env.CLICKUP_WORKSPACE_ID;
    const workspace = teamsData.teams?.find((team) => team.id === configuredWorkspace) || teamsData.teams?.[0];
    if (!workspace?.id) {
      return Response.json({ error: "Хандах боломжтой ClickUp workspace олдсонгүй." }, { status: 404 });
    }

    const parentsData = (await parentsResponse.json()) as { tasks?: ClickUpTask[] };
    const dailyTaskParents = parentsData.tasks || [];
    const workspaceId = workspace.id;
    const parentResults = await Promise.all(
      dailyTaskParents.map(async (parent) => ({
        parent,
        subtasks: parent.id ? await getCompletedSubtasks(parent.id, workspaceId, token) : [],
      })),
    );

    const parents = parentResults.map(({ parent, subtasks }) => ({
      id: safeText(parent.id),
      name: safeText(parent.name, "Daily Task"),
      assignees: mapAssignees(parent.assignees),
      completedCount: subtasks.length,
      fetchedCount: subtasks.length,
      fetched: true,
    }));

    const subtasks = parentResults
      .flatMap(({ parent, subtasks: children }) =>
        children.map((task) => {
          const taskAssignees = mapAssignees(task.assignees);
          return {
            id: safeText(task.id),
            name: safeText(task.name),
            parentId: safeText(parent.id),
            parentName: safeText(parent.name, "Daily Task"),
            assignment: taskAssignees.length > 0 ? taskAssignees : mapAssignees(parent.assignees),
            status: {
              name: safeText(task.status?.status, "complete"),
              color: safeColor(task.status?.color, "#168c80"),
              type: safeText(task.status?.type),
            },
            type: resolveType(task),
            dueDate: task.due_date || null,
            timeEstimate: task.time_estimate || null,
          };
        }),
      )
      .sort((a, b) => Number(b.dueDate || 0) - Number(a.dueDate || 0));

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
      peopleMap.set(id, person);
    }

    for (const task of subtasks) {
      const person = Array.from(peopleMap.values()).find((item) => item.parentIds.has(task.parentId));
      if (!person) continue;
      person.completeSubtasks += 1;
      person.withType += task.type ? 1 : 0;
      person.withEstimate += task.timeEstimate ? 1 : 0;
      person.estimateMs += task.timeEstimate || 0;
    }

    const people = Array.from(peopleMap.values())
      .map((person) => ({
        ...person,
        parentIds: Array.from(person.parentIds),
      }))
      .sort((a, b) => CX_TEAM_MEMBERS.indexOf(a.name) - CX_TEAM_MEMBERS.indexOf(b.name));

    const estimateMs = subtasks.reduce((sum, task) => sum + (task.timeEstimate || 0), 0);
    const withType = subtasks.filter((task) => task.type).length;
    const withEstimate = subtasks.filter((task) => task.timeEstimate).length;
    const dataQuality = {
      missingAssignment: subtasks.filter((task) => task.assignment.length === 0).length,
      missingStatus: subtasks.filter((task) => !task.status.name).length,
      missingType: subtasks.filter((task) => !task.type).length,
      missingDueDate: subtasks.filter((task) => !task.dueDate).length,
      missingTimeEstimate: subtasks.filter((task) => !task.timeEstimate).length,
    };

    const payload = {
      workspace: {
        id: workspace.id,
        name: safeText(workspace.name, "ClickUp Workspace"),
        color: safeColor(workspace.color, "#7b68ee"),
        memberCount: Array.isArray(workspace.members) ? workspace.members.length : 0,
      },
      list: { id: CX_DEV_TEAM_LIST_ID, name: "CX Dev.Team" },
      reportYear: REPORT_YEAR,
      people,
      parents,
      subtasks,
      summary: {
        dailyTaskParents: parents.length,
        completeSubtasks: subtasks.length,
        withType,
        withEstimate,
        estimateMs,
      },
      dataQuality,
      partial: false,
      syncedAt: new Date().toISOString(),
    } satisfies ClickUpSnapshot;

    await saveSnapshot(payload);

    return Response.json({ ...payload, cacheSource: "clickup" }, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "ClickUp API-тай холбогдоход алдаа гарлаа." }, { status: 502 });
  }
}
