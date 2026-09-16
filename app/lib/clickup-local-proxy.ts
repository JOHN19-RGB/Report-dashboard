const DEFAULT_CLICKUP_PROXY_ORIGIN = "https://b2c-team-report-dashboard.vercel.app";

export async function proxyClickUpForLocalDevelopment(request: Request, pathname: string) {
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
    return new Response(await response.arrayBuffer(), {
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
