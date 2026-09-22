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
  assert.match(masterHtml, /Task Performance Comparison|Таск гүйцэтгэлийн харьцуулалт/);
  assert.match(masterHtml, /Хугацаа:/);
  assert.match(masterHtml, /Segment:/);
  assert.match(masterHtml, /All Segments/);
  assert.match(masterHtml, /aria-label="Sprint эсвэл segment"/);
  assert.match(masterHtml, />Sprints<\/button>/);
  assert.match(masterHtml, /11–12, 13–14/);
  assert.match(masterHtml, /data-kpi="completion"/);
  assert.match(masterHtml, /data-kpi="team-average"/);
  assert.match(masterHtml, /Team Average|Багийн гишүүдийн/);
  assert.match(masterHtml, /5 assignee average/);
  assert.match(masterHtml, /class="chart-area dev-cx-chart"/);
  assert.match(masterHtml, /class="dev-panel dev-performance-panel" data-task-type="Bug"/);
  assert.doesNotMatch(masterHtml, /dev-bar-tooltip|dev-bar-cap/);
  assert.match(masterHtml, />Bug<\/button>/);
  assert.match(masterHtml, />Improvement<\/button>/);
  assert.doesNotMatch(masterHtml, /completed by due date|Project Performance · On-time|dev-zero-line/);
  assert.match(masterHtml, /2025–2026/);
  assert.match(masterHtml, /Жил/);
  assert.match(masterHtml, /Сар/);
  assert.doesNotMatch(masterHtml, /class="dev-date-filter"/);
  assert.match(masterHtml, /All data/);
  assert.match(masterHtml, /<header class="topbar">/);
  assert.match(masterHtml, /class="hero dev-dashboard-hero"/);
  assert.match(masterHtml, /<h1>Dev\.Master<span>\.<\/span><\/h1>/);
  assert.match(masterHtml, /class="dev-dashboard-heading-top"/);
  assert.match(masterHtml, /class="dev-dashboard-actions" role="group"/);
  const navigation = masterHtml.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0];
  assert.ok(navigation);
  assert.doesNotMatch(navigation, /dev-dashboard-actions|dev-download-filter|dev-refresh-filter/);
  assert.match(masterHtml, /class="dev-dashboard-filters"[\s\S]*?class="dev-select-filter dev-type-filter"[\s\S]*?class="dev-dashboard-actions"/);
  assert.match(masterHtml, /aria-label="Таск төрлийн тайлбар"/);
  assert.match(masterHtml, /class="icon-button dev-download-filter"[^>]*aria-label="All data татах"/);
  assert.match(masterHtml, /class="icon-button dev-refresh-filter"[^>]*aria-label="Өгөгдөл уншиж байна"/);
  assert.doesNotMatch(masterHtml, />All data<|>Шинэчлэх<|dev-heading-copy/);
  assert.match(masterHtml, /Project Team Members Productivity/);
  assert.match(masterHtml, /aria-label="Productivity харагдац"/);
  assert.match(masterHtml, />List<\/button>/);
  assert.match(masterHtml, />Card<\/button>/);
  assert.match(masterHtml, /Total Tasks · Team Distribution/);
  assert.match(masterHtml, /CX &amp; Dev · Bug \/ IMP дүгнэлт/);
  assert.match(masterHtml, /CX Dev дүгнэлтийн сар/);
  assert.match(masterHtml, /Өөрчлөлтийн хүсэлт/);
  assert.match(masterHtml, /Хамгийн сүүлийн 5 хүсэлт харагдана/);
  assert.match(masterHtml, /class="dev-change-count"/);
  assert.doesNotMatch(masterHtml, /dev-topbar|Hello, Baigalmaa|Хэрэглэгчийн цэс/);
  assert.match(projectsHtml, /Одоогоор өгөгдөл алга/);
  assert.doesNotMatch(masterHtml, /class="kpi-grid|clickup-page-panel/);
  assert.doesNotMatch(projectsHtml, /class="kpi-grid|clickup-page-panel/);
});

test("keeps Dev bar counts hover-only with CX-style bars and accessible labels", async () => {
  const [dashboard, css] = await Promise.all([
    readFile(new URL("../app/components/dev-master-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /className="bar-value" aria-hidden="true">\{item.count\}/);
  assert.match(dashboard, /data-comparison=\{selectedPeriods.length && !item.selected \? "previous" : "current"\}/);
  assert.match(dashboard, /aria-label=\{`\$\{item.label\}: \$\{item.count\}/);
  assert.doesNotMatch(dashboard, /dev-bar-tooltip|dev-bar-cap/);
  assert.match(css, /\.dev-cx-chart \.bar-group \.bar-value \{[^}]*color: transparent;/);
  assert.match(css, /\.dev-cx-chart \.bar-group:hover \.bar-value,[\s\S]*?\.dev-cx-chart \.bar-group:focus-visible \.bar-value \{ color: var\(--ink\); \}/);
  assert.doesNotMatch(css, /\.dev-cx-chart \.bar-group\.active \.bar-value/);
  assert.match(css, /\.dev-performance-panel \{ --series-color: #ff876d;/);
  assert.match(css, /\.dev-performance-panel\[data-task-type="Imp"\] \{ --series-color: #6d9eff;/);
  assert.match(dashboard, /Bug: "#ff876d", Imp: "#6d9eff"/);
  assert.match(css, /\.dev-cx-chart \.bar-fill \{ background: #dfe3e9;/);
  assert.match(css, /\.dev-cx-chart \.bar-group:hover \.bar-fill,[\s\S]*?background: var\(--series-color\)/);
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
  assert.match(clickUpRoute, /requestClickUp/);
  assert.match(clickUpRoute, /readClickUpTaskPages/);
  assert.match(devClickUpRoute, /process\.env\.CLICKUP_API_TOKEN/);
  assert.match(devClickUpRoute, /B2C Master/);
  assert.match(devClickUpRoute, /include_timl/);
  assert.match(devClickUpRoute, /resolveSprintAssignments/);
  assert.match(devClickUpRoute, /scopeDevReportTasks/);
  assert.match(devClickUpRoute, /custom_item_id/);
  assert.match(devClickUpRoute, /\/custom_item/);
  assert.match(devClickUpRoute, /task\.tags/);
  assert.match(devDashboard, /clickUpReportLoader\.load\("\/api\/clickup\/dev"/);
  assert.match(devDashboard, /refreshPath: "\/api\/clickup\/dev\?refresh=tasks"/);
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
  assert.match(devReport, /parentName\.split\("\|"\)\[0\]/);
  assert.match(devDashboard, /downloadAllDevData/);
  assert.match(devDashboard, /dev-change-scroll/);
  assert.doesNotMatch(devDashboard, /changes\.slice\(/);
  assert.doesNotMatch(devDashboard, /DEV_REPORT_DATA|dev-topbar/);
  assert.match(route, /reasoning_effort: "none"/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter/);
});
