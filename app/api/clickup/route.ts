type ClickUpUser = {
  id?: number;
  username?: string;
  color?: string | null;
  profilePicture?: string | null;
};

type ClickUpTask = {
  id?: string;
  custom_id?: string | null;
  name?: string;
  text_content?: string;
  status?: { status?: string; color?: string; type?: string };
  orderindex?: string;
  date_created?: string;
  date_updated?: string;
  date_closed?: string | null;
  date_done?: string | null;
  archived?: boolean;
  creator?: ClickUpUser;
  assignees?: ClickUpUser[];
  watchers?: ClickUpUser[];
  tags?: Array<{ name?: string; tag_fg?: string; tag_bg?: string }>;
  parent?: string | null;
  priority?: { priority?: string; color?: string } | null;
  due_date?: string | null;
  start_date?: string | null;
  points?: number | null;
  time_estimate?: number | null;
  time_spent?: number | null;
  custom_fields?: Array<{ id?: string; name?: string; type?: string; value?: unknown }>;
  dependencies?: unknown[];
  linked_tasks?: unknown[];
  team_id?: string;
  url?: string;
  list?: { id?: string; name?: string; access?: boolean };
  project?: { id?: string; name?: string; hidden?: boolean; access?: boolean };
  folder?: { id?: string; name?: string; hidden?: boolean; access?: boolean };
  space?: { id?: string; name?: string };
};

function safeColor(value: unknown, fallback = "#64748b") {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeCustomValue(value: unknown) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => (typeof item === "object" ? "[object]" : item));
  return "[object]";
}

async function clickUpFetch(path: string, token: string) {
  return fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    cache: "no-store",
  });
}

export async function GET() {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    return Response.json({ error: "ClickUp API тохиргоо хийгдээгүй байна." }, { status: 503 });
  }

  try {
    const teamsResponse = await clickUpFetch("/team", token);
    if (!teamsResponse.ok) {
      return Response.json({ error: "ClickUp workspace мэдээлэл татаж чадсангүй." }, { status: teamsResponse.status });
    }

    const teamsData = (await teamsResponse.json()) as {
      teams?: Array<{ id?: string; name?: string; color?: string; members?: unknown[] }>;
    };
    const configuredWorkspace = process.env.CLICKUP_WORKSPACE_ID;
    const workspace = teamsData.teams?.find((team) => team.id === configuredWorkspace) || teamsData.teams?.[0];
    if (!workspace?.id) {
      return Response.json({ error: "Хандах боломжтой ClickUp workspace олдсонгүй." }, { status: 404 });
    }

    const query = new URLSearchParams({
      page: "0",
      order_by: "updated",
      reverse: "false",
      include_closed: "true",
      subtasks: "true",
    });
    const tasksResponse = await clickUpFetch(`/team/${encodeURIComponent(workspace.id)}/task?${query}`, token);
    if (!tasksResponse.ok) {
      return Response.json({ error: "ClickUp task мэдээлэл татаж чадсангүй." }, { status: tasksResponse.status });
    }

    const taskData = (await tasksResponse.json()) as { tasks?: ClickUpTask[]; last_page?: boolean };
    const tasks = (taskData.tasks || []).slice(0, 100).map((task) => ({
      id: safeText(task.id),
      customId: task.custom_id || null,
      name: safeText(task.name, "Нэргүй task"),
      description: safeText(task.text_content).slice(0, 4_000),
      status: {
        name: safeText(task.status?.status, "Төлөвгүй"),
        color: safeColor(task.status?.color),
        type: safeText(task.status?.type),
      },
      archived: Boolean(task.archived),
      creator: task.creator
        ? { id: task.creator.id || null, name: safeText(task.creator.username, "Тодорхойгүй"), color: safeColor(task.creator.color) }
        : null,
      assignees: (task.assignees || []).map((user) => ({
        id: user.id || null,
        name: safeText(user.username, "Тодорхойгүй"),
        color: safeColor(user.color),
        avatar: safeText(user.profilePicture) || null,
      })),
      watchers: (task.watchers || []).map((user) => safeText(user.username)).filter(Boolean),
      priority: task.priority
        ? { name: safeText(task.priority.priority), color: safeColor(task.priority.color, "#ff6b4a") }
        : null,
      dates: {
        created: task.date_created || null,
        updated: task.date_updated || null,
        start: task.start_date || null,
        due: task.due_date || null,
        done: task.date_done || null,
        closed: task.date_closed || null,
      },
      time: {
        estimate: task.time_estimate || null,
        spent: task.time_spent || null,
      },
      points: task.points ?? null,
      parent: task.parent || null,
      tags: (task.tags || []).map((tag) => ({
        name: safeText(tag.name),
        foreground: safeColor(tag.tag_fg, "#475569"),
        background: safeColor(tag.tag_bg, "#e2e8f0"),
      })),
      customFields: (task.custom_fields || [])
        .filter((field) => field.value != null)
        .slice(0, 20)
        .map((field) => ({
          id: safeText(field.id),
          name: safeText(field.name),
          type: safeText(field.type),
          value: safeCustomValue(field.value),
        })),
      relationships: {
        dependencies: Array.isArray(task.dependencies) ? task.dependencies.length : 0,
        linkedTasks: Array.isArray(task.linked_tasks) ? task.linked_tasks.length : 0,
      },
      location: {
        space: safeText(task.space?.name),
        folder: safeText(task.folder?.name || task.project?.name),
        list: safeText(task.list?.name),
      },
      url: safeText(task.url),
    }));

    return Response.json({
      workspace: {
        id: workspace.id,
        name: safeText(workspace.name, "ClickUp Workspace"),
        color: safeColor(workspace.color, "#7b68ee"),
        memberCount: Array.isArray(workspace.members) ? workspace.members.length : 0,
      },
      tasks,
      page: 0,
      pageSize: tasks.length,
      hasMore: taskData.last_page === false || tasks.length === 100,
      syncedAt: new Date().toISOString(),
    });
  } catch {
    return Response.json({ error: "ClickUp API-тай холбогдоход алдаа гарлаа." }, { status: 502 });
  }
}
