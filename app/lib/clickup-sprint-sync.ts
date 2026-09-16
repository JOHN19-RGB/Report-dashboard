import type { DevSprint, DevTask } from "./dev-report";

export type SprintSyncState = { failed: boolean; partial: boolean; memberCount: number; matchedTaskCount: number; error?: string };
export type SprintAssignment = { sprint: DevSprint; taskIds: string[]; partial: boolean; failed: boolean; error?: string };

export function mergeSprintMemberships(
  tasks: DevTask[],
  previousSprints: DevSprint[],
  assignments: SprintAssignment[],
  previousState: Record<string, SprintSyncState> = {},
) {
  const sprintById = new Map(previousSprints.map(sprint => [sprint.id, { ...sprint }]));
  const membershipByTask = new Map(tasks.map(task => [task.id, new Set(task.sprintIds || [])]));
  const state = { ...previousState };

  for (const assignment of assignments) {
    const id = assignment.sprint.id;
    const matchedIds = Array.from(new Set(assignment.taskIds)).filter(taskId => membershipByTask.has(taskId));
    // Only a complete successful response is authoritative enough to remove old links.
    if (!assignment.failed && !assignment.partial) {
      for (const membership of membershipByTask.values()) membership.delete(id);
    }
    if (!assignment.failed) {
      for (const taskId of matchedIds) membershipByTask.get(taskId)!.add(id);
    }
    sprintById.set(id, {
      ...assignment.sprint,
      ...(assignment.failed && sprintById.has(id) ? sprintById.get(id) : {}),
      partial: assignment.failed || assignment.partial,
    });
    state[id] = {
      failed: assignment.failed,
      partial: assignment.partial,
      memberCount: new Set(assignment.taskIds).size,
      matchedTaskCount: matchedIds.length,
      ...(assignment.error ? { error: assignment.error } : {}),
    };
  }

  const sprints = Array.from(sprintById.values()).sort((a, b) =>
    (b.startDate || b.endDate || "").localeCompare(a.startDate || a.endDate || "") || b.name.localeCompare(a.name, undefined, { numeric: true }),
  );
  const sprintOrder = new Map(sprints.map((sprint, index) => [sprint.id, index]));
  const mergedTasks = tasks.map(task => {
    const sprintIds = Array.from(membershipByTask.get(task.id)!).filter(id => sprintById.has(id)).sort((a, b) => sprintOrder.get(a)! - sprintOrder.get(b)!);
    return { ...task, sprintIds, sprint: sprintById.get(sprintIds[0])?.name || "" };
  });
  const counts = new Map<string, number>();
  for (const task of mergedTasks) for (const id of task.sprintIds) counts.set(id, (counts.get(id) || 0) + 1);
  return { tasks: mergedTasks, sprints: sprints.map(sprint => ({ ...sprint, taskCount: counts.get(sprint.id) || 0 })), state };
}
