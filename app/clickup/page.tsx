"use client";

import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  LayoutDashboard,
  Layers3,
  ListChecks,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ClickUpAssignee = {
  id: number | null;
  name: string;
  color: string;
  avatar: string | null;
};

type ClickUpParent = {
  id: string;
  name: string;
  assignees: ClickUpAssignee[];
  completedCount: number;
  fetchedCount: number;
  fetched: boolean;
};

type ClickUpPerson = {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
  parentIds: string[];
  completeSubtasks: number;
  withType: number;
  withEstimate: number;
  estimateMs: number;
};

type ClickUpSubtask = {
  id: string;
  parentId: string;
  parentName: string;
  assignment: ClickUpAssignee[];
  status: { name: string; color: string; type: string };
  type: { name: string; color: string } | null;
  dueDate: string | null;
  timeEstimate: number | null;
};

type ClickUpPayload = {
  list: { id: string; name: string };
  reportYear: number;
  people: ClickUpPerson[];
  parents: ClickUpParent[];
  subtasks: ClickUpSubtask[];
  dataQuality: { missingTimeEstimate: number };
  partial: boolean;
  syncedAt: string;
  cacheSource?: "snapshot" | "clickup";
};

const LATEST_TASK_LIMIT = 10;

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value);
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "—";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatDuration(value: number | null) {
  if (!value) return "—";
  const totalMinutes = Math.round(value / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${formatNumber(hours)}ц ${minutes}м` : `${minutes} мин`;
}

export default function ClickUpPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<ClickUpPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [personId, setPersonId] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const selectedPerson = data?.people.find((person) => person.id === personId) || data?.people[0] || null;
  const availableTypes = useMemo(() => {
    const parentIds = new Set(selectedPerson?.parentIds || []);
    return Array.from(new Set(
      (data?.subtasks || [])
        .filter((task) => parentIds.has(task.parentId))
        .map((task) => task.type?.name)
        .filter((name): name is string => Boolean(name)),
    )).sort();
  }, [data, selectedPerson]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("mn-MN");
    const parentIds = new Set(selectedPerson?.parentIds || []);
    return (data?.subtasks || []).filter((task) => {
      const matchesPerson = parentIds.has(task.parentId);
      const matchesType = typeFilter === "all" || task.type?.name === typeFilter;
      const haystack = [task.parentName, task.type?.name, ...task.assignment.map((item) => item.name)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("mn-MN");
      return matchesPerson && matchesType && (!query || haystack.includes(query));
    });
  }, [data, search, selectedPerson, typeFilter]);

  const latestTasks = useMemo(
    () => [...filteredTasks]
      .sort((a, b) => Number(b.dueDate || 0) - Number(a.dueDate || 0))
      .slice(0, LATEST_TASK_LIMIT),
    [filteredTasks],
  );

  useEffect(() => {
    void loadData(false);
  }, []);

  async function loadData(refresh: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(refresh ? "/api/clickup?refresh=1" : "/api/clickup", { cache: "no-store" });
      const result = (await response.json()) as ClickUpPayload & { error?: string };
      if (!response.ok || !Array.isArray(result.people) || !Array.isArray(result.parents) || !Array.isArray(result.subtasks)) {
        throw new Error(result.error || "ClickUp өгөгдөл татаж чадсангүй.");
      }
      setData(result);
      setPersonId((current) => result.people.some((person) => person.id === current) ? current : result.people[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ClickUp өгөгдөл татаж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`} aria-label="Үндсэн цэс">
        <div className="brand">
          <span className="brand-logo-wrap"><img className="brand-logo" src="/cody-logo.svg" alt="Cody" width="151" height="59" /></span>
        </div>
        <nav className="nav-list">
          <Link className="nav-item" href="/#overview" onClick={() => setMobileMenu(false)}><LayoutDashboard size={19} /><span>Хураангуй</span></Link>
          <Link className="nav-item" href="/#workload" onClick={() => setMobileMenu(false)}><ListChecks size={19} /><span>Ажлын төрөл</span></Link>
          <Link className="nav-item" href="/#comparison" onClick={() => setMobileMenu(false)}><TrendingUp size={19} /><span>Харьцуулалт</span></Link>
          <Link className="nav-item" href="/#ai-summary" onClick={() => setMobileMenu(false)}><Sparkles size={19} /><span>AI нэгтгэл</span></Link>
          <Link className="nav-item nav-item-bottom active" href="/clickup" onClick={() => setMobileMenu(false)}><Layers3 size={19} /><span>ClickUp таск</span></Link>
        </nav>
        <div className="sidebar-note">
          <div className="sidebar-note-icon"><Bot size={18} /></div>
          <div><strong>ClickUp snapshot</strong><span>Refresh товч дарахад л шинэчлэгдэнэ</span></div>
        </div>
        <div className="sidebar-footer"><span className="online-dot" />{loading ? "Data уншиж байна" : error ? "ClickUp холболт тасарсан" : "Хадгалсан ClickUp data"}</div>
      </aside>

      {mobileMenu && <button className="menu-backdrop" onClick={() => setMobileMenu(false)} aria-label="Цэс хаах" />}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Тайлан</span><ArrowRight size={14} /><strong>ClickUp таск</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="period-select" aria-label="Тайлангийн жил сонгох"><CalendarDays size={16} /> 2026 он <ChevronDown size={14} /></button>
            <button className="export-button" onClick={() => window.print()}><Download size={16} /><span>Тайлан татах</span></button>
          </div>
        </header>

        <div className="content-wrap clickup-page-wrap">
          <section className="hero clickup-page-hero">
            <div className="eyebrow"><span /> CX DEV.TEAM · SAVED SNAPSHOT</div>
            <div className="hero-row">
              <div><h1>ClickUp таск<span>.</span></h1><p>2026 оны хамгийн сүүлийн 10 complete subtask-ийг ажилтан, Type болон Assignment-аар шалгана.</p></div>
            </div>
          </section>

          <section className="clickup-panel clickup-page-panel" id="clickup">
            <div className="clickup-head">
              <div className="clickup-title-row">
                <div className="clickup-logo" aria-hidden="true"><span /><span /><span /></div>
                <div>
                  <div className="clickup-source"><span className="live-pulse" />CLICKUP SAVED SNAPSHOT</div>
                  <h2>{data?.list.name || "CX Dev.Team"} · 2026 Daily Task</h2>
                  <p>Хамгийн сүүлд гараар шинэчилсэн complete subtask-уудыг харуулж байна.</p>
                </div>
              </div>
              <button className="clickup-refresh" onClick={() => void loadData(true)} disabled={loading}>
                <RefreshCw className={loading ? "spin" : ""} size={15} />{loading ? "Шинэчилж байна" : "Шинэчлэх"}
              </button>
            </div>

            {error ? (
              <div className="clickup-error">
                <span><X size={18} /></span><div><strong>Өгөгдөл татагдсангүй</strong><p>{error}</p></div>
                <button onClick={() => void loadData(true)}>Дахин оролдох</button>
              </div>
            ) : (
              <>
                <div className="clickup-stats">
                  <div><span className="clickup-stat-icon purple"><Layers3 size={17} /></span><span><small>2026 DAILY TASK PARENT</small><strong>{loading ? "—" : formatNumber(selectedPerson?.parentIds.length || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon green"><CheckCircle2 size={17} /></span><span><small>COMPLETE SUBTASK</small><strong>{loading ? "—" : formatNumber(selectedPerson?.completeSubtasks || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon orange"><ListChecks size={17} /></span><span><small>TYPE БҮРТГЭЛТЭЙ</small><strong>{loading ? "—" : formatNumber(selectedPerson?.withType || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon blue"><Clock3 size={17} /></span><span><small>TIME ESTIMATE</small><strong>{loading ? "—" : formatDuration(selectedPerson?.estimateMs || 0)}</strong></span></div>
                </div>

                <div className="person-selector" role="tablist" aria-label="CX Dev.Team ажилтан сонгох">
                  {loading
                    ? Array.from({ length: 4 }).map((_, index) => <span className="person-card person-card-loading" key={index} />)
                    : (data?.people || []).map((person) => (
                        <button
                          className={`person-card ${selectedPerson?.id === person.id ? "active" : ""}`}
                          key={person.id}
                          onClick={() => { setPersonId(person.id); setSearch(""); setTypeFilter("all"); }}
                          role="tab"
                          aria-selected={selectedPerson?.id === person.id}
                        >
                          <span className="person-avatar" style={{ background: person.color }}>{person.avatar ? <img src={person.avatar} alt="" /> : person.name.slice(0, 1).toUpperCase()}</span>
                          <span className="person-card-copy"><small>2026 · COMPLETE</small><strong>{person.name}</strong></span>
                          <span className="person-task-count"><strong>{formatNumber(person.completeSubtasks)}</strong><small>subtask</small></span>
                        </button>
                      ))}
                </div>

                <div className="clickup-toolbar">
                  <label className="task-search">
                    <Search size={15} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Assignment эсвэл Type-аар хайх" />
                    {search && <button onClick={() => setSearch("")} aria-label="Хайлт цэвэрлэх"><X size={14} /></button>}
                  </label>
                  <label className="status-filter">
                    <span>Type</span>
                    <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                      <option value="all">Бүх Type</option>
                      {availableTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <span className="filter-result">Сүүлийн {formatNumber(latestTasks.length)} / {formatNumber(filteredTasks.length)} үр дүн</span>
                </div>

                <div className="clickup-table-wrap">
                  <table className="clickup-table">
                    <thead><tr><th>Assignment</th><th>Status</th><th>Type</th><th>Due date</th><th>Time estimate</th></tr></thead>
                    <tbody>
                      {loading
                        ? Array.from({ length: LATEST_TASK_LIMIT }).map((_, index) => <tr className="task-loading-row" key={index}><td colSpan={5}><span style={{ animationDelay: `${index * 80}ms` }} /></td></tr>)
                        : latestTasks.map((task, index) => (
                            <tr className="subtask-row" key={task.id} style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}>
                              <td>
                                <div className="subtask-assignment">
                                  <div className="assignee-stack">{task.assignment.length > 0 ? task.assignment.slice(0, 3).map((assignee) => <span key={`${task.id}-${assignee.id}`} title={assignee.name} style={{ background: assignee.color }}>{assignee.name.slice(0, 1).toUpperCase()}</span>) : <em>—</em>}</div>
                                  <span><strong>{task.assignment.map((item) => item.name).join(", ") || "—"}</strong><small>{task.parentName}</small></span>
                                </div>
                              </td>
                              <td><span className="api-status" style={{ color: task.status.color, background: `${task.status.color}16` }}><i style={{ background: task.status.color }} />{task.status.name}</span></td>
                              <td>{task.type ? <span className="type-badge" style={{ color: task.type.color, background: `${task.type.color}14` }}><i style={{ background: task.type.color }} />{task.type.name}</span> : <span className="empty-value">Тодорхойгүй</span>}</td>
                              <td><span className="due-date">{formatDate(task.dueDate)}</span></td>
                              <td><span className={`estimate-cell ${task.timeEstimate ? "" : "missing-estimate"}`}><Clock3 size={13} />{task.timeEstimate ? formatDuration(task.timeEstimate) : "Оруулаагүй"}</span></td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {!loading && filteredTasks.length === 0 && <div className="empty-tasks"><Search size={21} /><strong>Тохирох subtask олдсонгүй</strong><span>Хайлт эсвэл шүүлтүүрээ өөрчилнө үү.</span></div>}
                </div>

                <div className="clickup-footnote">
                  <span><span className="online-dot" />{data ? `${formatDate(String(new Date(data.syncedAt).getTime()), true)}-д синк хийсэн` : "API холболт"}</span>
                  <span>{selectedPerson?.name || "4 ажилтан"} · {data?.reportYear || 2026} оны data{data?.partial ? " · Зарим parent task түр татагдсангүй" : data?.cacheSource === "clickup" ? " · ClickUp-ээс шинээр татсан" : " · Хадгалсан snapshot"}{data?.dataQuality.missingTimeEstimate ? ` · ${data.dataQuality.missingTimeEstimate} task-д estimate оруулаагүй` : ""}</span>
                </div>
              </>
            )}
          </section>

          <footer className="report-footer"><span>ClickUp task report · 2026</span><span>Refresh товч дарахад shared snapshot шинэчлэгдэнэ.</span></footer>
        </div>
      </main>
    </div>
  );
}
