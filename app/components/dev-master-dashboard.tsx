"use client";

import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  Gift,
  ListFilter,
  Menu,
  MessageSquareText,
  MoreVertical,
  RotateCcw,
  Search,
  Settings,
  TimerReset,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import TeamSidebar from "./team-sidebar";
import {
  DEV_REPORT_DATA,
  DEV_TASK_TYPES,
  memberProductivity,
  monthlyTaskPerformance,
  selectChangeRequests,
  selectDevTasks,
  taskTypeTotals,
  type DevReportFilters,
  type DevTaskType,
} from "../lib/dev-report";

const TYPE_COLORS: Record<DevTaskType, string> = {
  Imp: "#8bc7ff",
  Bug: "#168df2",
  Headless: "#ffc400",
  Hold: "#30bd63",
  "Not bug/imp": "#0db9a7",
};

const DEFAULT_FILTERS: DevReportFilters = {
  search: "",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  taskType: "all",
};

function formatHours(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function DevMasterDashboard() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [filters, setFilters] = useState<DevReportFilters>(DEFAULT_FILTERS);
  const tasks = useMemo(() => selectDevTasks(DEV_REPORT_DATA, filters), [filters]);
  const changes = useMemo(() => selectChangeRequests(DEV_REPORT_DATA, filters), [filters]);
  const typeTotals = useMemo(() => taskTypeTotals(tasks), [tasks]);
  const team = useMemo(() => memberProductivity(DEV_REPORT_DATA, tasks), [tasks]);
  const monthly = useMemo(() => monthlyTaskPerformance(tasks, DEV_REPORT_DATA.reportYear), [tasks]);
  const maxMonthly = Math.max(1, ...monthly.flatMap(item => [item.bug, item.imp]));
  const totalTypeCount = typeTotals.reduce((sum, item) => sum + item.count, 0);
  const objectivePercent = Math.round((DEV_REPORT_DATA.objectives.completed / DEV_REPORT_DATA.objectives.total) * 100);
  const performance = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.performanceScore, 0) / tasks.length) : 0;
  const completion = tasks.length ? Math.round((tasks.filter(task => task.done).length / tasks.length) * 100) : 0;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  let donutPosition = 0;
  const donut = typeTotals.map(item => {
    const start = donutPosition;
    donutPosition += totalTypeCount ? (item.count / totalTypeCount) * 100 : 0;
    return `${TYPE_COLORS[item.type]} ${start}% ${donutPosition}%`;
  }).join(", ");

  function updateFilter<Key extends keyof DevReportFilters>(key: Key, value: DevReportFilters[Key]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  return <div className="app-shell dev-dashboard">
    <TeamSidebar section="dev" page="master" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar dev-topbar">
        <div className="dev-topbar-search">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
          <label className="dev-search">
            <Search size={16} />
            <input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Ажил, ажилтан эсвэл хүсэлт хайх" aria-label="Dev тайлангаас хайх" />
          </label>
        </div>
        <div className="dev-user-tools" aria-label="Хэрэглэгчийн цэс">
          <button aria-label="Мэдэгдэл"><Bell size={17} /><small>2</small></button>
          <button aria-label="Мессеж"><MessageSquareText size={17} /><small>6</small></button>
          <button aria-label="Бэлэг"><Gift size={17} /></button>
          <button className="alert" aria-label="Тохиргоо"><Settings size={17} /><small>10</small></button>
          <span className="dev-user-name">Hello, <strong>Baigalmaa</strong></span>
          <span className="dev-avatar" aria-hidden="true">Б</span>
        </div>
      </header>

      <div className="content-wrap dev-dashboard-wrap">
        <section className="dev-dashboard-heading">
          <div><h1>Dev.master</h1><p>Сайн байна уу? Т. Байгалмаа.</p></div>
          <div className="dev-dashboard-filters" aria-label="Dev тайлангийн шүүлтүүр">
            <div className="dev-date-filter">
              <CalendarDays size={17} />
              <input type="date" value={filters.startDate} max={filters.endDate} onChange={event => updateFilter("startDate", event.target.value)} aria-label="Эхлэх огноо" />
              <span>—</span>
              <input type="date" value={filters.endDate} min={filters.startDate} onChange={event => updateFilter("endDate", event.target.value)} aria-label="Дуусах огноо" />
            </div>
            <label className="dev-type-filter"><ListFilter size={17} /><span>Task Type:</span><select value={filters.taskType} onChange={event => updateFilter("taskType", event.target.value as DevReportFilters["taskType"])}><option value="all">All Types</option>{DEV_TASK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} /></label>
            {hasFilters && <button className="dev-reset-filter" onClick={() => setFilters(DEFAULT_FILTERS)}><RotateCcw size={15} /> Цэвэрлэх</button>}
          </div>
        </section>

        <section className="dev-kpi-grid" aria-label="Dev төслийн гол үзүүлэлтүүд">
          <article className="dev-kpi-card"><div><strong>{tasks.length}</strong><span>Total Tasks</span><small><CheckCircle2 size={12} /> {completion}% done</small></div><span className="dev-kpi-art coral"><ClipboardCheck size={31} /></span></article>
          <article className="dev-kpi-card"><div><strong>{objectivePercent}%</strong><span>Project Objectives<br />Achievement</span><small><CheckCircle2 size={12} /> {DEV_REPORT_DATA.objectives.completed}/{DEV_REPORT_DATA.objectives.total} goals</small></div><span className="dev-progress-ring" style={{ "--progress": `${objectivePercent * 3.6}deg` } as CSSProperties}><b>{objectivePercent}%</b></span></article>
          <article className="dev-kpi-card"><div><strong>{performance}%</strong><span>Project Performance · Present Avg</span><small><i /> {tasks.length} filtered tasks</small><span className="dev-kpi-progress"><i style={{ width: `${performance}%` }} /></span></div><span className="dev-kpi-art violet"><Gauge size={31} /></span></article>
          <article className="dev-kpi-card"><div><strong>{DEV_REPORT_DATA.sprint}</strong><span>Sprint</span><small>2026 · active cycle</small></div><span className="dev-kpi-art amber"><TimerReset size={31} /></span></article>
        </section>

        <section className="dev-chart-grid">
          <article className="dev-panel dev-performance-panel">
            <header><div><h2>Task Performance Comparison</h2><p><span className="bug" /> Bug <span className="imp" /> Imp</p></div><span className="dev-period-badge"><CalendarDays size={14} /> This Year</span></header>
            <div className="dev-bar-chart" role="img" aria-label="Сар бүрийн Bug болон Imp ажлын харьцуулалт">
              <div className="dev-axis-labels"><span>{maxMonthly}</span><span>0</span><span>-{maxMonthly}</span></div>
              <span className="dev-zero-line" />
              <div className="dev-months">
                {monthly.map(item => <div className="dev-month" key={item.month} title={`${item.month}: Bug ${item.bug}, Imp ${item.imp}`}><span className="dev-half upper"><i className="bug-bar" style={{ height: `${(item.bug / maxMonthly) * 86}%` }} /></span><span className="dev-half lower"><i className="imp-bar" style={{ height: `${(item.imp / maxMonthly) * 86}%` }} /></span><small>{item.month}</small></div>)}
              </div>
            </div>
          </article>

          <article className="dev-panel dev-type-panel">
            <header><h2>Task Type</h2><button aria-label="Task Type нэмэлт цэс"><MoreVertical size={18} /></button></header>
            <div className="dev-donut-layout">
              <div className="dev-donut" style={{ background: totalTypeCount ? `conic-gradient(${donut})` : "#edf1f6" }}><span><strong>{totalTypeCount}</strong><small>tasks</small></span></div>
              <ul>{typeTotals.map(item => <li key={item.type}><span style={{ background: TYPE_COLORS[item.type] }} /><b>{item.type}</b><strong>{item.count}</strong></li>)}</ul>
            </div>
          </article>
        </section>

        <section className="dev-panel dev-table-panel">
          <header><div><h2>Project Team Members Productivity</h2><p>{tasks.length} ажил · сонгосон хугацаа</p></div></header>
          <div className="dev-table-wrap"><table><thead><tr><th>Position</th><th>Employee Name</th><th>Present</th><th>Time Estimate</th><th>Total Tasks</th><th>Done Tasks</th></tr></thead><tbody>{team.map(member => <tr key={member.id}><td><span className="dev-role-dot" />{member.position}</td><td>{member.name}</td><td>{member.presence}%</td><td>{formatHours(member.estimateHours)}</td><td><span className="dev-count total">{member.totalTasks}</span></td><td><span className={`dev-count done ${member.doneTasks === member.totalTasks && member.totalTasks ? "complete" : ""}`}>{member.doneTasks}</span></td></tr>)}</tbody></table></div>
        </section>

        <section className="dev-panel dev-table-panel dev-change-panel">
          <header><div><h2>Өөрчлөлтийн хүсэлт</h2><p>{changes.length} хүсэлт · сонгосон хугацаа</p></div></header>
          <div className="dev-table-wrap"><table><thead><tr><th>Вэбсайт</th><th>Хийгдсэн ажил</th><th>Хариуцсан ажилтан</th></tr></thead><tbody>{changes.map(request => <tr key={request.id}><td><span className="dev-role-dot" /><a href={`https://${request.website}`} target="_blank" rel="noreferrer">{request.website}</a></td><td>{request.request}</td><td>{request.owner}</td></tr>)}</tbody></table>{!changes.length && <p className="dev-no-results">Тохирох өөрчлөлтийн хүсэлт олдсонгүй.</p>}</div>
        </section>
      </div>
    </main>
  </div>;
}
