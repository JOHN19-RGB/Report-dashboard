import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the work report dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Ажлын тайлан · 2026<\/title>/i);
  assert.match(html, /Ажлын тайлан/);
  assert.match(html, /Гүйцэтгэсэн ажил/);
  assert.match(html, /GROQ AI/);
  assert.match(html, /href="\/"[^>]*>CX<\/a>/);
  assert.match(html, /Dev\.Master/);
  assert.match(html, /Dev\.All project/);
  assert.doesNotMatch(html, /CX\.Master|CX\.All project|B2C\.Master/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Building your site/i);
});

test("keeps the dashboard filter and ClickUp task table on separate routes", async () => {
  const [dashboardResponse, clickUpResponse] = await Promise.all([render("/"), render("/clickup")]);
  assert.equal(dashboardResponse.status, 200);
  assert.equal(clickUpResponse.status, 200);

  const [dashboardHtml, clickUpHtml] = await Promise.all([dashboardResponse.text(), clickUpResponse.text()]);
  assert.match(dashboardHtml, /Assignment/);
  assert.match(dashboardHtml, /href="\/clickup"/);
  assert.doesNotMatch(dashboardHtml, /clickup-page-panel/);
  assert.match(clickUpHtml, /ClickUp таск/);
  assert.match(clickUpHtml, /clickup-page-panel/);
  assert.match(clickUpHtml, /href="\/clickup"[^>]*aria-current="page"[^>]*>ClickUp таск/);
});

test("renders the Dev master dashboard and keeps all-project separate", async () => {
  const [masterResponse, projectsResponse] = await Promise.all([render("/dev/master"), render("/dev/all-project")]);
  assert.equal(masterResponse.status, 200);
  assert.equal(projectsResponse.status, 200);

  const [masterHtml, projectsHtml] = await Promise.all([masterResponse.text(), projectsResponse.text()]);
  assert.match(masterHtml, /Dev\.Master/);
  assert.match(projectsHtml, /Dev\.All project/);
  assert.match(masterHtml, /Task Performance Comparison/);
  assert.match(masterHtml, /Хугацаа:/);
  assert.match(masterHtml, /Sprint:/);
  assert.match(masterHtml, /All Sprints/);
  assert.match(masterHtml, /2025–2026/);
  assert.match(masterHtml, /All data/);
  assert.match(masterHtml, /Project Team Members Productivity/);
  assert.match(masterHtml, /Өөрчлөлтийн хүсэлт/);
  assert.doesNotMatch(masterHtml, /dev-topbar|Hello, Baigalmaa|Хэрэглэгчийн цэс/);
  assert.match(projectsHtml, /Одоогоор өгөгдөл алга/);
  assert.doesNotMatch(masterHtml, /class="kpi-grid|clickup-page-panel/);
  assert.doesNotMatch(projectsHtml, /class="kpi-grid|clickup-page-panel/);
});

test("removes starter preview and keeps API credentials server-side", async () => {
  const [page, route, clickUpRoute, devClickUpRoute, devDashboard, devReport, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/summarize/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clickup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clickup/dev/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/dev-master-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/dev-report.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  assert.match(page, /fetch\("\/api\/summarize"/);
  assert.doesNotMatch(page, /GROQ_API_KEY|CLICKUP_API_TOKEN|api\.groq\.com|pk_[A-Za-z0-9_]+/);
  assert.match(route, /process\.env\.GROQ_API_KEY/);
  assert.match(clickUpRoute, /process\.env\.CLICKUP_API_TOKEN/);
  assert.match(clickUpRoute, /api\.clickup\.com\/api\/v2/);
  assert.match(devClickUpRoute, /process\.env\.CLICKUP_API_TOKEN/);
  assert.match(devClickUpRoute, /B2C Master/);
  assert.match(devClickUpRoute, /include_timl/);
  assert.match(devClickUpRoute, /resolveSprintAssignments/);
  assert.match(devClickUpRoute, /scopeDevReportTasks/);
  assert.match(devDashboard, /fetch\(refresh \? "\/api\/clickup\/dev\?refresh=tasks" : "\/api\/clickup\/dev"/);
  assert.match(devDashboard, /\/api\/clickup\/dev\?refresh=recent-sprints/);
  assert.match(devDashboard, /sprintId/);
  assert.match(devReport, /DEV_REPORT_START_YEAR = 2025/);
  assert.match(devReport, /DEV_REPORT_END_YEAR = 2026/);
  assert.match(devReport, /scopeDevReportTasks/);
  assert.match(devReport, /Ariunbileg Garam-Ayush/);
  assert.match(devReport, /Ulziibayar S/);
  assert.match(devReport, /maralmaa/);
  assert.match(devReport, /Erdenejargal/);
  assert.match(devReport, /Yesugen/);
  assert.match(devDashboard, /downloadAllDevData/);
  assert.doesNotMatch(devDashboard, /DEV_REPORT_DATA|dev-topbar/);
  assert.match(route, /reasoning_effort: "none"/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter/);
});
