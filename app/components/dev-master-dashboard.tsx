"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardCheck,
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
  memberProductivity,
  monthlyTaskPerformance,
  reportMetrics,
  selectDevTasks,
  taskTypeTotals,
  type DevReportData,
  type DevReportFilters,
} from "../lib/dev-report";

const TYPE_PALETTE = ["#8bc7ff", "#168df2", "#ffc400", "#30bd63", "#0db9a7", "#7468ff", "#ff7b88", "#64748b"];
const DEFAULT_FILTERS: DevReportFilters = { search: "", startDate: "2026-01-01", endDate: "2026-12-31", taskType: "all", sprintId: "all" };
type PeriodPreset = "year" | "quarter" | "month" | "last30" | "custom" | "sprint";

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

function periodRange(period: Exclude<PeriodPreset, "custom" | "sprint">, year: number) {
  const today = new Date();
  const anchor = today.getUTCFullYear() === year ? today : new Date(Date.UTC(year, 11, 31));
  if (period === "year") return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  if (period === "month") {
    const month = anchor.getUTCMonth();
    return { startDate: isoDate(new Date(Date.UTC(year, month, 1))), endDate: isoDate(new Date(Date.UTC(year, month + 1, 0))) };
  }
  if (period === "quarter") {
    const startMonth = Math.floor(anchor.getUTCMonth() / 3) * 3;
    return { startDate: isoDate(new Date(Date.UTC(year, startMonth, 1))), endDate: isoDate(new Date(Date.UTC(year, startMonth + 3, 0))) };
  }
  const end = new Date(Date.UTC(year, anchor.getUTCMonth(), anchor.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function selectedPeriod(filters: DevReportFilters, year: number): PeriodPreset {
  if (filters.sprintId !== "all") return "sprint";
  for (const period of ["year", "quarter", "month", "last30"] as const) {
    const range = periodRange(period, year);
    if (range.startDate === filters.startDate && range.endDate === filters.endDate) return period;
  }
  return "custom";
}

function formatDateRange(startDate: string, endDate: string) {
  const format = (value: string) => value ? value.replaceAll("-", ".") : "—";
  return `${format(startDate)} — ${format(endDate)}`;
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
        tasks: payload.tasks.map(task => ({ ...task, sprintIds: Array.isArray(task.sprintIds) ? task.sprintIds : [] })),
      };
      setData(normalizedPayload);
      setFilters(current => ({
        ...current,
        ...(!refresh ? periodRange("year", payload.reportYear) : {}),
        taskType: current.taskType === "all" || payload.tasks.some(task => task.type === current.taskType) ? current.taskType : "all",
        sprintId: current.sprintId === "all" || normalizedPayload.sprints.some(sprint => sprint.id === current.sprintId) ? current.sprintId : "all",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "B2C Master list-ийн мэдээлэл татагдсангүй.");
    } finally {
      setLoading(false);
    }
  }

  const tasks = useMemo(() => data ? selectDevTasks(data, filters) : [], [data, filters]);
  const chartYear = Number((filters.startDate || filters.endDate).slice(0, 4)) || data?.reportYear || 2026;
  const typeTotals = useMemo(() => taskTypeTotals(tasks), [tasks]);
  const team = useMemo(() => memberProductivity(tasks), [tasks]);
  const monthly = useMemo(() => monthlyTaskPerformance(tasks, chartYear), [chartYear, tasks]);
  const changes = useMemo(() => changeRequestRows(tasks), [tasks]);
  const metrics = useMemo(() => reportMetrics(tasks), [tasks]);
  const taskTypes = useMemo(() => Array.from(new Set((data?.tasks || []).map(task => task.type).filter(type => type !== "Тодорхойгүй"))).sort(), [data]);
  const sprints = data?.sprints || [];
  const selectedSprint = sprints.find(item => item.id === filters.sprintId) || null;
  const period = selectedPeriod(filters, data?.reportYear || 2026);
  const periodLabel = selectedSprint?.name || formatDateRange(filters.startDate, filters.endDate);
  const maxMonthly = Math.max(1, ...monthly.flatMap(item => [item.bug, item.imp]));
  const totalTypeCount = typeTotals.reduce((sum, item) => sum + item.count, 0);
  const sprint = currentSprint(tasks, sprints, filters.sprintId);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify({ ...DEFAULT_FILTERS, ...periodRange("year", data?.reportYear || 2026) });
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
    setFilters(current => ({ ...current, ...periodRange(value, data?.reportYear || 2026), sprintId: "all" }));
  }

  function applySprint(sprintId: string) {
    if (sprintId === "all") {
      setFilters(current => ({ ...current, ...periodRange("year", data?.reportYear || 2026), sprintId }));
      return;
    }
    const selected = sprints.find(item => item.id === sprintId);
    if (!selected) return;
    setFilters(current => ({ ...current, sprintId, startDate: selected.startDate || "", endDate: selected.endDate || "" }));
  }

  function resetFilters() {
    const year = data?.reportYear || 2026;
    setFilters({ ...DEFAULT_FILTERS, ...periodRange("year", year) });
  }

  return <div className="app-shell dev-dashboard">
    <TeamSidebar section="dev" page="master" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <div className="content-wrap dev-dashboard-wrap">
        <section className="dev-dashboard-heading">
          <div className="dev-heading-copy">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div><h1>Dev.master</h1><p>{data?.list.name || "B2C Master"} · ClickUp {loading ? "өгөгдөл уншиж байна" : `сүүлд ${formatSyncDate(data?.syncedAt)} шинэчлэгдсэн`}</p></div>
          </div>
          <div className="dev-dashboard-filters" aria-label="Dev тайлангийн шүүлтүүр">
            <label className="dev-filter-search"><Search size={16} /><input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Ажил, ажилтан эсвэл төсөл хайх" aria-label="Dev тайлангаас хайх" /></label>
            <label className="dev-select-filter dev-period-filter"><Clock3 size={17} /><span>Хугацаа:</span><select value={period} onChange={event => applyPeriod(event.target.value as PeriodPreset)} aria-label="Тайлангийн хугацаа"><option value="year">This Year</option><option value="quarter">This Quarter</option><option value="month">This Month</option><option value="last30">Last 30 Days</option>{period === "sprint" && <option value="sprint">Sprint dates</option>}{period === "custom" && <option value="custom">Custom</option>}</select><ChevronDown size={14} /></label>
            <div className="dev-date-filter">
              <CalendarDays size={17} />
              <input type="date" value={filters.startDate} max={filters.endDate} onChange={event => updateDateFilter("startDate", event.target.value)} aria-label="Эхлэх огноо" />
              <span>—</span>
              <input type="date" value={filters.endDate} min={filters.startDate} onChange={event => updateDateFilter("endDate", event.target.value)} aria-label="Дуусах огноо" />
            </div>
            <label className="dev-select-filter dev-sprint-filter"><Flag size={17} /><span>Sprint:</span><select value={filters.sprintId} onChange={event => applySprint(event.target.value)} aria-label="ClickUp sprint"><option value="all">All Sprints</option>{!loading && !sprints.length && <option disabled>ClickUp sprint олдсонгүй</option>}{sprints.map(item => <option key={item.id} value={item.id}>{item.name}{item.folder ? ` · ${item.folder}` : ""} ({item.taskCount})</option>)}</select><ChevronDown size={14} /></label>
            <label className="dev-select-filter dev-type-filter"><ListFilter size={17} /><span>Task Type:</span><select value={filters.taskType} onChange={event => updateFilter("taskType", event.target.value)}><option value="all">All Types</option>{taskTypes.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} /></label>
            {hasFilters && <button className="dev-reset-filter" onClick={resetFilters}><RotateCcw size={15} /> Цэвэрлэх</button>}
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
              <div className="dev-months">{monthly.map(item => <div className="dev-month" key={item.month} title={`${item.month}: Bug ${item.bug}, Imp ${item.imp}`}><span className="dev-half upper"><i className="bug-bar" style={{ height: `${(item.bug / maxMonthly) * 86}%` }} /></span><span className="dev-half lower"><i className="imp-bar" style={{ height: `${(item.imp / maxMonthly) * 86}%` }} /></span><small>{item.month}</small></div>)}</div>
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
          <header><div><h2>Project Team Members Productivity</h2><p>{tasks.length} ажил · ClickUp assignee бүрээр</p></div></header>
          <div className="dev-table-wrap"><table><thead><tr><th>Position</th><th>Employee Name</th><th>Completion</th><th>Time Estimate</th><th>Total Tasks</th><th>Done Tasks</th></tr></thead><tbody>{team.map(member => <tr key={member.id}><td><span className="dev-role-dot" />{member.position}</td><td>{member.name}</td><td>{member.completion}%</td><td>{formatDuration(member.estimateMs)}</td><td><span className="dev-count total">{member.totalTasks}</span></td><td><span className={`dev-count done ${member.doneTasks === member.totalTasks && member.totalTasks ? "complete" : ""}`}>{member.doneTasks}</span></td></tr>)}</tbody></table>{!team.length && !loading && <p className="dev-no-results">Тохирох assignee бүхий ажил олдсонгүй.</p>}</div>
        </section>

        <section className="dev-panel dev-table-panel dev-change-panel">
          <header><div><h2>Өөрчлөлтийн хүсэлт</h2><p>{changes.length} ажил · B2C Master list</p></div></header>
          <div className="dev-table-wrap"><table><thead><tr><th>Вэбсайт / Төсөл</th><th>Хийгдсэн ажил</th><th>Хариуцсан ажилтан</th></tr></thead><tbody>{changes.slice(0, 50).map(request => <tr key={request.id}><td><span className="dev-role-dot" />{request.url ? <a href={request.url} target="_blank" rel="noreferrer">{request.website}</a> : request.website}</td><td>{request.request}</td><td>{request.owner}</td></tr>)}</tbody></table>{!changes.length && !loading && <p className="dev-no-results">Тохирох ажил олдсонгүй.</p>}</div>
        </section>
      </div>
    </main>
  </div>;
}
