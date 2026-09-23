const DEFAULT_CLICKUP_PROXY_ORIGIN = "https://b2c-team-report-dashboard.vercel.app";

export async function proxyClickUpForLocalDevelopment(request: Request, pathname: string, snapshotId: number) {
  if (process.env.NODE_ENV !== "development") return null;

  const requestUrl = new URL(request.url);
  const proxyOrigin = process.env.CLICKUP_LOCAL_PROXY_URL || DEFAULT_CLICKUP_PROXY_ORIGIN;
  const targetUrl = new URL(pathname, proxyOrigin);
  if (targetUrl.origin === requestUrl.origin) return null;
  targetUrl.search = requestUrl.search;

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await response.text();
    if (response.ok) {
      const payload = JSON.parse(body);
      const compactView = requestUrl.searchParams.get("view") === "all-project";
      if (!compactView && typeof payload.syncedAt === "string" && (Array.isArray(payload.tasks) || Array.isArray(payload.subtasks))) {
        await saveClickUpSnapshot(snapshotId, payload);
      }
    }
    return new Response(body, {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "X-ClickUp-Source": "production-proxy",
      },
    });
  } catch (error) {
    console.error("Local ClickUp proxy failed", error);
    return Response.json({ error: "Local ClickUp proxy холбогдож чадсангүй." }, { status: 502 });
  }
}
import { saveClickUpSnapshot } from "../../db/clickup-snapshot";
