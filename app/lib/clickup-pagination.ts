type TaskPage<T> = { tasks?: T[]; last_page?: boolean };

export function mergeClickUpTaskSnapshot<T extends { id: string }>(previous: T[], current: T[], partial: boolean) {
  return partial ? [...new Map([...previous, ...current].map(task => [task.id, task])).values()] : current;
}

/** A short page is not the end when ClickUp explicitly reports more pages. */
export async function readClickUpTaskPages<T extends { id?: string }>(
  readPage: (page: number) => Promise<TaskPage<T>>,
  { pageLimit = 100, batchSize = 2 } = {},
) {
  const tasks = new Map<string, T>();
  let pagesRead = 0;
  for (let start = 0; start < pageLimit; start += batchSize) {
    const pages = await Promise.allSettled(Array.from({ length: Math.min(batchSize, pageLimit - start) }, (_, offset) => readPage(start + offset)));
    for (const result of pages) {
      if (result.status === "rejected") throw result.reason;
      const page = result.value;
      if (!Array.isArray(page.tasks)) throw new Error("ClickUp task page is missing its tasks array");
      pagesRead += 1;
      for (const task of page.tasks) {
        if (!task.id) throw new Error("ClickUp task is missing its ID");
        tasks.set(task.id, task);
      }
      if (page.last_page === true || (page.last_page !== false && page.tasks.length < 100)) {
        return { tasks: [...tasks.values()], partial: false, pagesRead };
      }
    }
  }
  return { tasks: [...tasks.values()], partial: true, pagesRead };
}
