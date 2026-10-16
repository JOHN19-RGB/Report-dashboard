/** A full re-sync catches deleted or moved tasks that an updated-since query cannot see. */
export const CLICKUP_FULL_SYNC_INTERVAL_MS = 6 * 60 * 60_000;
/** Re-read a few minutes before the last sync so clock skew and in-flight edits are not missed. */
export const CLICKUP_DELTA_OVERLAP_MS = 5 * 60_000;

type RawCxTask = {
  id?: string;
  parent?: string | null;
  status?: { status?: string };
  due_date?: string | null;
};

function statusName(task: RawCxTask) {
  return (task.status?.status || "").trim().toLocaleLowerCase();
}

export function isDailyTaskParent(task: RawCxTask) {
  return statusName(task) === "daily task";
}

export function isCompletedReportSubtask(task: RawCxTask, year: number) {
  const due = Number(task.due_date);
  return statusName(task) === "complete" && Boolean(task.parent) && Number.isFinite(due) && due >= Date.UTC(year, 0, 1) && due < Date.UTC(year + 1, 0, 1);
}

/** Monthly due-date windows keep each ClickUp query small enough to answer quickly and in parallel. */
export function reportMonthWindows(year: number) {
  return Array.from({ length: 12 }, (_, month) => ({ start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) }));
}

export function shouldRunCxDeltaSync(snapshot: { syncedAt?: unknown; fullSyncedAt?: unknown; parents?: unknown; subtasks?: unknown } | null, now = Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.parents) || !Array.isArray(snapshot.subtasks)) return false;
  const fullSyncedAt = Date.parse(typeof snapshot.fullSyncedAt === "string" ? snapshot.fullSyncedAt : "");
  const syncedAt = Date.parse(typeof snapshot.syncedAt === "string" ? snapshot.syncedAt : "");
  return Number.isFinite(fullSyncedAt) && Number.isFinite(syncedAt) && now - fullSyncedAt < CLICKUP_FULL_SYNC_INTERVAL_MS;
}

/** Applies tasks updated since the last sync onto the stored report rows. */
export function mergeCxDelta<P extends { id: string }, S extends { id: string; parentId: string }, T extends RawCxTask>(
  parents: P[],
  subtasks: S[],
  delta: T[],
  { year, mapParent, mapSubtask }: { year: number; mapParent: (task: T) => P; mapSubtask: (task: T, parent: P) => S },
) {
  const parentById = new Map(parents.map(parent => [parent.id, parent]));
  const subtaskById = new Map(subtasks.map(subtask => [subtask.id, subtask]));
  for (const task of delta) {
    if (!task.id) continue;
    if (isDailyTaskParent(task)) parentById.set(task.id, mapParent(task));
    else parentById.delete(task.id);
  }
  for (const task of delta) {
    if (!task.id) continue;
    const parent = task.parent ? parentById.get(task.parent) : undefined;
    if (parent && isCompletedReportSubtask(task, year)) subtaskById.set(task.id, mapSubtask(task, parent));
    else subtaskById.delete(task.id);
  }
  return {
    parents: [...parentById.values()],
    subtasks: [...subtaskById.values()].filter(subtask => parentById.has(subtask.parentId)),
  };
}
