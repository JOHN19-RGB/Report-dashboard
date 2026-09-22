type Snapshot = { syncedAt: string; taskSyncedAt?: string };
export const CLICKUP_FRESHNESS_MS = 15 * 60_000;

export function isClickUpSnapshotStale(timestamp: string | undefined, now = Date.now()) {
  const time = Date.parse(timestamp || "");
  return !Number.isFinite(time) || now - time >= CLICKUP_FRESHNESS_MS;
}

export function needsClickUpSprintRefresh(report: Snapshot & {
  sprints?: unknown[]; sprintSyncedAt?: string; sprintNeedsFullRefresh?: boolean; sprintSyncErrors?: number;
}, now = Date.now()) {
  return Boolean(report.sprintNeedsFullRefresh || report.sprintSyncErrors || !report.sprints?.length || isClickUpSnapshotStale(report.sprintSyncedAt || report.syncedAt, now));
}

/** Browser-memory reuse only; all data is rechecked against the server on navigation. */
export function createClickUpReportLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  const snapshots = new Map<string, Snapshot>();
  const pending = new Map<string, Promise<unknown>>();

  async function read<T extends Snapshot>(url: string, validate: (value: unknown) => value is T) {
    let request = pending.get(url);
    if (!request) {
      request = (async () => {
        const response = await fetcher(url, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "ClickUp өгөгдөл татагдсангүй.");
        return payload;
      })();
      pending.set(url, request);
    }
    try {
      const payload = await request;
      if (!validate(payload)) throw new Error("ClickUp өгөгдлийн бүтэц буруу байна.");
      return payload;
    } finally {
      if (pending.get(url) === request) pending.delete(url);
    }
  }

  function remember<T extends Snapshot>(path: string, payload: T) { snapshots.set(path, payload); }

  async function load<T extends Snapshot>(path: string, options: {
    refreshPath: string;
    refresh?: boolean;
    validate: (value: unknown) => value is T;
    onData: (data: T) => void;
  }) {
    const cached = snapshots.get(path);
    if (cached && options.validate(cached)) options.onData(cached);
    const publish = (payload: T) => { remember(path, payload); options.onData(payload); return payload; };
    let payload = publish(await read(options.refresh ? options.refreshPath : path, options.validate));
    if (!options.refresh && isClickUpSnapshotStale(payload.taskSyncedAt || payload.syncedAt, now())) {
      payload = publish(await read(options.refreshPath, options.validate));
    }
    return payload;
  }
  return { load, read, remember };
}

export const clickUpReportLoader = createClickUpReportLoader();
