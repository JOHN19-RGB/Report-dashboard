"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardCheck,
  Download,
  Flag,
  Gauge,
  ListFilter,
  Menu,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Search,
  TimerReset,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import TeamSidebar from "./team-sidebar";
import {
  changeRequestRows,
  currentSprint,
  DEV_REPORT_END_DATE,
  DEV_REPORT_END_YEAR,
  DEV_REPORT_START_DATE,
  DEV_REPORT_START_YEAR,
  DEV_TEAM_ASSIGNEES,
  memberProductivity,
  monthlyTaskPerformance,
  reportMetrics,
  scopeDevReportTasks,
  selectDevTasks,
  taskDate,
  taskTypeTotals,
  type DevReportData,
  type DevReportFilters,
  type DevTask,
} from "../lib/dev-report";

const TYPE_PALETTE = ["#8bc7ff", "#168df2", "#ffc400", "#30bd63", "#0db9a7", "#7468ff", "#ff7b88", "#64748b"];
const DEFAULT_FILTERS: DevReportFilters = { search: "", startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE, taskType: "all", sprintId: "all" };
type PeriodPreset = "both" | "2025" | "2026" | "last30" | "custom" | "sprint";

function formatDuration(value: number) {
  const totalMinutes = Math.round(value / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatSyncDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function periodRange(period: Exclude<PeriodPreset, "custom" | "sprint">) {
  if (period === "both") return { startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE };
  if (period === "2025") return { startDate: "2025-01-01", endDate: "2025-12-31" };
  if (period === "2026") return { startDate: "2026-01-01", endDate: "2026-12-31" };

  const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const todayPart = (type: Intl.DateTimeFormatPartTypes) => Number(todayParts.find(item => item.type === type)?.value || 0);
  const current = new Date(Date.UTC(todayPart("year"), todayPart("month") - 1, todayPart("day")));
  const minimum = new Date(`${DEV_REPORT_START_DATE}T00:00:00Z`);
  const maximum = new Date(`${DEV_REPORT_END_DATE}T00:00:00Z`);
  const end = current < minimum ? minimum : current > maximum ? maximum : current;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: isoDate(start < minimum ? minimum : start), endDate: isoDate(end) };
}

function selectedPeriod(filters: DevReportFilters): PeriodPreset {
  if (filters.sprintId !== "all") return "sprint";
  for (const period of ["both", "2025", "2026", "last30"] as const) {
    const range = periodRange(period);
    if (range.startDate === filters.startDate && range.endDate === filters.endDate) return period;
  }
  return "custom";
}

function formatDateRange(startDate: string, endDate: string) {
  const format = (value: string) => value ? value.replaceAll("-", ".") : "—";
  return `${format(startDate)} — ${format(endDate)}`;
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadAllDevData(tasks: DevTask[]) {
  const headers = ["Task ID", "Task Name", "Parent Task", "Project / Website", "Status", "Task Type", "Tags", "Sprint", "Assignees", "Start Date", "Due Date", "Closed Date", "Updated At", "Task Date", "Time Estimate (hours)", "Position", "Custom Fields", "ClickUp URL"];
  const rows = tasks.map(task => [
    task.id,
    task.name,
    task.parentName,
    task.project,
    task.status.name,
    task.type,
    (task.tags || []).join(", "),
    task.sprint,
    task.assignees.map(assignee => assignee.name).join(", "),
    task.startDate,
    task.dueDate,
    task.closedDate,
    task.updatedAt,
    taskDate(task),
    task.timeEstimateMs == null ? "" : (task.timeEstimateMs / 3_600_000).toFixed(2),
    task.position,
    Object.entries(task.customFields).map(([name, value]) => `${name}: ${value}`).join(" | "),
    task.url,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Dev-Master-${DEV_REPORT_START_YEAR}-${DEV_REPORT_END_YEAR}-all-data.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DevMasterDashboard() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<DevReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<DevReportFilters>(DEFAULT_FILTERS);

  useEffect(() => { void loadData(false); }, []);

  async function loadData(refresh: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(refresh ? "/api/clickup/dev?refresh=tasks" : "/api/clickup/dev", { cache: "no-store" });
      let payload = (await response.json()) as DevReportData & { error?: string };
      if (!response.ok || !Array.isArray(payload.tasks)) throw new Error(payload.error || "B2C Master list-ийн мэдээлэл татагдсангүй.");
      if (refresh) {
        const sprintResponse = await fetch("/api/clickup/dev?refresh=recent-sprints", { cache: "no-store" });
        const sprintPayload = (await sprintResponse.json()) as DevReportData & { error?: string };
        if (sprintResponse.ok && Array.isArray(sprintPayload.tasks)) payload = sprintPayload;
        else payload = { ...payload, partial: true, sprintSyncErrors: Math.max(1, payload.sprintSyncErrors || 0) };
      }
      const normalizedPayload: DevReportData = {
        ...payload,
        sprints: Array.isArray(payload.sprints) ? payload.sprints : [],
        tasks: scopeDevReportTasks(payload.tasks.map(task => ({ ...task, tags: Array.isArray(task.tags) ? task.tags : [], sprintIds: Array.isArray(task.sprintIds) ? task.sprintIds : [], updatedAt: task.updatedAt || null }))),
      };
      setData(normalizedPayload);
      setFilters(current => ({
        ...current,
        ...(!refresh ? periodRange("both") : {}),
        taskType: current.taskType === "all" || normalizedPayload.tasks.some(task => task.type === current.taskType) ? current.taskType : "all",
        sprintId: current.sprintId === "all" || normalizedPayload.tasks.some(task => task.sprintIds.includes(current.sprintId)) ? current.sprintId : "all",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "B2C Master list-ийн мэдээлэл татагдсангүй.");
    } finally {
      setLoading(false);
    }
  }

  const tasks = useMemo(() => data ? selectDevTasks(data, filters) : [], [data, filters]);
  const allTeamTasks = useMemo(() => data ? selectDevTasks(data, DEFAULT_FILTERS) : [], [data]);
  const typeTotals = useMemo(() => taskTypeTotals(tasks), [tasks]);
  const team = useMemo(() => memberProductivity(tasks), [tasks]);
  const monthly = useMemo(() => monthlyTaskPerformance(tasks, filters.startDate, filters.endDate), [filters.endDate, filters.startDate, tasks]);
  const changes = useMemo(() => changeRequestRows(tasks), [tasks]);
  const metrics = useMemo(() => reportMetrics(tasks), [tasks]);
  const taskTypes = useMemo(() => Array.from(new Set((data?.tasks || []).map(task => task.type).filter(type => type !== "Тодорхойгүй"))).sort(), [data]);
  const sprints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of data?.tasks || []) {
      for (const sprintId of task.sprintIds) counts.set(sprintId, (counts.get(sprintId) || 0) + 1);
    }
    return (data?.sprints || []).map(sprint => ({ ...sprint, taskCount: counts.get(sprint.id) || 0 })).filter(sprint => sprint.taskCount > 0);
  }, [data]);
  const selectedSprint = sprints.find(item => item.id === filters.sprintId) || null;
  const period = selectedPeriod(filters);
  const periodLabel = selectedSprint?.name || formatDateRange(filters.startDate, filters.endDate);
  const maxMonthly = Math.max(1, ...monthly.flatMap(item => [item.bug, item.imp]));
  const totalTypeCount = typeTotals.reduce((sum, item) => sum + item.count, 0);
  const sprint = currentSprint(tasks, sprints, filters.sprintId);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  let donutPosition = 0;
  const donut = typeTotals.map((item, index) => {
    const start = donutPosition;
    donutPosition += totalTypeCount ? (item.count / totalTypeCount) * 100 : 0;
    return `${TYPE_PALETTE[index % TYPE_PALETTE.length]} ${start}% ${donutPosition}%`;
  }).join(", ");

  function updateFilter<Key extends keyof DevReportFilters>(key: Key, value: DevReportFilters[Key]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function updateDateFilter(key: "startDate" | "endDate", value: string) {
    setFilters(current => ({ ...current, [key]: value, sprintId: "all" }));
  }

  function applyPeriod(value: PeriodPreset) {
    if (value === "custom" || value === "sprint") return;
    setFilters(current => ({ ...current, ...periodRange(value), sprintId: "all" }));
  }

  function applySprint(sprintId: string) {
    if (sprintId === "all") {
      setFilters(current => ({ ...current, ...periodRange("both"), sprintId }));
      return;
    }
    const selected = sprints.find(item => item.id === sprintId);
    if (!selected) return;
    const startDate = selected.startDate && selected.startDate > DEV_REPORT_START_DATE ? selected.startDate : DEV_REPORT_START_DATE;
    const endDate = selected.endDate && selected.endDate < DEV_REPORT_END_DATE ? selected.endDate : DEV_REPORT_END_DATE;
    setFilters(current => ({ ...current, sprintId, startDate, endDate }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  return <div className="app-shell dev-dashboard">
    <TeamSidebar section="dev" page="master" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <div className="content-wrap dev-dashboard-wrap">
        <section className="dev-dashboard-heading">
          <div className="dev-heading-copy">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div><h1>Dev.master</h1><p>{data?.list.name || "B2C Master"} · {DEV_REPORT_START_YEAR}–{DEV_REPORT_END_YEAR} · {DEV_TEAM_ASSIGNEES.length} assignee · ClickUp {loading ? "өгөгдөл уншиж байна" : `сүүлд ${formatSyncDate(data?.syncedAt)} шинэчлэгдсэн`}</p></div>
          </div>
          <div className="dev-dashboard-filters" aria-label="Dev тайлангийн шүүлтүүр">
            <label className="dev-filter-search"><Search size={16} /><input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Ажил, ажилтан эсвэл төсөл хайх" aria-label="Dev тайлангаас хайх" /></label>
            <label className="dev-select-filter dev-period-filter"><Clock3 size={17} /><span>Хугацаа:</span><select value={period} onChange={event => applyPeriod(event.target.value as PeriodPreset)} aria-label="Тайлангийн хугацаа"><option value="both">2025–2026</option><option value="2025">2025</option><option value="2026">2026</option><option value="last30">Last 30 Days</option>{period === "sprint" && <option value="sprint">Sprint dates</option>}{period === "custom" && <option value="custom">Custom</option>}</select><ChevronDown size={14} /></label>
            <div className="dev-date-filter">
              <CalendarDays size={17} />
              <input type="date" value={filters.startDate} min={DEV_REPORT_START_DATE} max={filters.endDate || DEV_REPORT_END_DATE} onChange={event => updateDateFilter("startDate", event.target.value)} aria-label="Эхлэх огноо" />
              <span>—</span>
              <input type="date" value={filters.endDate} min={filters.startDate || DEV_REPORT_START_DATE} max={DEV_REPORT_END_DATE} onChange={event => updateDateFilter("endDate", event.target.value)} aria-label="Дуусах огноо" />
            </div>
            <label className="dev-select-filter dev-sprint-filter"><Flag size={17} /><span>Sprint:</span><select value={filters.sprintId} onChange={event => applySprint(event.target.value)} aria-label="ClickUp sprint"><option value="all">All Sprints</option>{!loading && !sprints.length && <option disabled>ClickUp sprint олдсонгүй</option>}{sprints.map(item => <option key={item.id} value={item.id}>{item.name}{item.folder ? ` · ${item.folder}` : ""} ({item.taskCount})</option>)}</select><ChevronDown size={14} /></label>
            <label className="dev-select-filter dev-type-filter"><ListFilter size={17} /><span>Task Type:</span><select value={filters.taskType} onChange={event => updateFilter("taskType", event.target.value)}><option value="all">All Types</option>{taskTypes.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} /></label>
            {hasFilters && <button className="dev-reset-filter" onClick={resetFilters}><RotateCcw size={15} /> Цэвэрлэх</button>}
            <button className="dev-download-filter" type="button" onClick={() => downloadAllDevData(allTeamTasks)} disabled={loading || !allTeamTasks.length} title={`${DEV_REPORT_START_YEAR}–${DEV_REPORT_END_YEAR} оны ${DEV_TEAM_ASSIGNEES.length} assignee-ийн бүх өгөгдөл`}><Download size={15} />All data</button>
            <button className="dev-refresh-filter" onClick={() => void loadData(true)} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />{loading ? "Уншиж байна" : "Шинэчлэх"}</button>
          </div>
        </section>

        {error && <div className="clickup-error" role="alert"><span><X size={18} /></span><div><strong>ClickUp өгөгдөл татагдсангүй</strong><p>{error}</p></div><button onClick={() => void loadData(true)}>Дахин оролдох</button></div>}
        {data?.partial && <div className="dev-data-warning" role="status">{data.taskPartial ? "ClickUp-ийн B2C Master хариу 10,000 ажлын хязгаарт хүрсэн тул хамгийн сүүлийн ажлуудыг харуулж байна." : data.sprintSyncErrors ? `${data.sprintSyncErrors} sprint-ийн мэдээлэл түр шинэчлэгдсэнгүй. Бусад ClickUp өгөгдлийг хэвийн харуулж байна.` : "Зарим sprint 2,000-аас олон ажилтай тул тухайн sprint-ийн хамгийн сүүлийн ажлуудыг харуулж байна."}</div>}

        <section className="dev-kpi-grid" aria-label="Dev төслийн гол үзүүлэлтүүд">
          <article className="dev-kpi-card"><div><strong>{loading ? "—" : tasks.length}</strong><span>Total Tasks</span><small><CheckCircle2 size={12} /> {metrics.doneTasks} completed</small></div><span className="dev-kpi-art coral"><ClipboardCheck size={31} /></span></article>
          <article className="dev-kpi-card"><div><strong>{loading ? "—" : `${metrics.objectiveAchievement}%`}</strong><span>Project Objectives<br />Achievement</span><small><CheckCircle2 size={12} /> Completion rate</small></div><span className="dev-progress-ring" style={{ "--progress": `${metrics.objectiveAchievement * 3.6}deg` } as CSSProperties}><b>{metrics.objectiveAchievement}%</b></span></article>
          <article className="dev-kpi-card"><div><strong>{loading ? "—" : `${metrics.performance}%`}</strong><span>Project Performance · On-time</span><small><i /> completed by due date</small><span className="dev-kpi-progress"><i style={{ width: `${metrics.performance}%` }} /></span></div><span className="dev-kpi-art violet"><Gauge size={31} /></span></article>
          <article className="dev-kpi-card"><div><strong>{loading ? "—" : sprint}</strong><span>Sprint</span><small>{formatDuration(metrics.estimateMs)} estimate</small></div><span className="dev-kpi-art amber"><TimerReset size={31} /></span></article>
        </section>

        <section className="dev-chart-grid">
          <article className="dev-panel dev-performance-panel">
            <header><div><h2>Task Performance Comparison</h2><p><span className="bug" /> Bug <span className="imp" /> Imp</p></div><span className="dev-period-badge" title={formatDateRange(filters.startDate, filters.endDate)}><CalendarDays size={14} /> {periodLabel}</span></header>
            <div className="dev-bar-chart" role="img" aria-label="Сар бүрийн Bug болон Imp ажлын харьцуулалт">
              <div className="dev-axis-labels"><span>{maxMonthly}</span><span>0</span><span>-{maxMonthly}</span></div><span className="dev-zero-line" />
              <div className="dev-months" style={{ "--month-count": monthly.length } as CSSProperties}>{monthly.map(item => <div className="dev-month" key={item.key} title={`${item.month}: Bug ${item.bug}, Imp ${item.imp}`}><span className="dev-half upper"><i className="bug-bar" style={{ height: `${(item.bug / maxMonthly) * 86}%` }} /></span><span className="dev-half lower"><i className="imp-bar" style={{ height: `${(item.imp / maxMonthly) * 86}%` }} /></span><small>{item.month}</small></div>)}</div>
            </div>
          </article>

          <article className="dev-panel dev-type-panel">
            <header><h2>Task Type</h2><button aria-label="Task Type нэмэлт цэс"><MoreVertical size={18} /></button></header>
            <div className="dev-donut-layout">
              <div className="dev-donut" style={{ background: totalTypeCount ? `conic-gradient(${donut})` : "#edf1f6" }}><span><strong>{totalTypeCount}</strong><small>tasks</small></span></div>
              <ul>{typeTotals.map((item, index) => <li key={item.type}><span style={{ background: TYPE_PALETTE[index % TYPE_PALETTE.length] }} /><b>{item.type}</b><strong>{item.count}</strong></li>)}</ul>
            </div>
          </article>
        </section>

        <section className="dev-panel dev-table-panel">
          <header><div><h2>Project Team Members Productivity</h2><p>{tasks.length} ажил · сонгосон {DEV_TEAM_ASSIGNEES.length} ClickUp assignee</p></div></header>
          <div className="dev-table-wrap"><table><thead><tr><th>Position</th><th>Employee Name</th><th>Completion</th><th>Time Estimate</th><th>Total Tasks</th><th>Done Tasks</th></tr></thead><tbody>{team.map(member => <tr key={member.id}><td><span className="dev-role-dot" />{member.position}</td><td>{member.name}</td><td>{member.completion}%</td><td>{formatDuration(member.estimateMs)}</td><td><span className="dev-count total">{member.totalTasks}</span></td><td><span className={`dev-count done ${member.doneTasks === member.totalTasks && member.totalTasks ? "complete" : ""}`}>{member.doneTasks}</span></td></tr>)}</tbody></table>{!team.length && !loading && <p className="dev-no-results">Тохирох assignee бүхий ажил олдсонгүй.</p>}</div>
        </section>

        <section className="dev-panel dev-table-panel dev-change-panel">
          <header><div><h2>Өөрчлөлтийн хүсэлт</h2><p>{changes.length} ажил · хамгийн сүүлийн 5 мөр харагдана, бусдыг гүйлгэж үзнэ</p></div></header>
          <div className="dev-table-wrap"><div className="dev-change-scroll"><table><thead><tr><th>Вэбсайт / Төсөл</th><th>Хийгдсэн ажил</th><th>Хариуцсан ажилтан</th></tr></thead><tbody>{changes.map(request => <tr key={request.id}><td><span className="dev-role-dot" />{request.url ? <a href={request.url} target="_blank" rel="noreferrer">{request.website}</a> : request.website}</td><td>{request.request}</td><td>{request.owner}</td></tr>)}</tbody></table>{!changes.length && !loading && <p className="dev-no-results">Тохирох ажил олдсонгүй.</p>}</div></div>
        </section>
      </div>
    </main>
  </div>;
}
