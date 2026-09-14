"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  ExternalLink,
  Clock3,
  Layers3,
  ListChecks,
  Menu,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import TeamSidebar, { CxReportNav } from "../components/team-sidebar";
import ReportDownload from "../components/report-download";
import { filterTasks, totals, taskMonth, type ReportData } from "../lib/report";
import { useEffect, useMemo, useState } from "react";

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
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [personId, setPersonId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [monthFilter, setMonthFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const selectedPerson = data?.people.find(person => person.id === personId) || null;
  const filters = { person: personId, type: typeFilter, search, month: monthFilter };
  const availableTypes = useMemo(() => Array.from(new Set((data?.subtasks || []).map(task => task.type?.name || "Тодорхойгүй"))).sort(), [data]);
  const availableMonths = useMemo(() => Array.from(new Set((data?.subtasks || []).map(taskMonth))).filter(Boolean).sort(), [data]);
  const filteredTasks = useMemo(() => data ? filterTasks(data, { person: personId, type: typeFilter, search, month: monthFilter }) : [], [data, personId, typeFilter, search, monthFilter]);
  const stats = totals(filteredTasks);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleTasks = filteredTasks.slice(pageStart, pageStart + pageSize);
  function resetFilters() { setPersonId("all"); setTypeFilter("all"); setSearch(""); setMonthFilter("all"); setPage(1); }

  useEffect(() => {
    void loadData(false);
  }, []);

  async function loadData(refresh: boolean) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(refresh ? "/api/clickup?refresh=1" : "/api/clickup", { cache: "no-store" });
      const result = (await response.json()) as ReportData & { error?: string };
      if (!response.ok || !Array.isArray(result.people) || !Array.isArray(result.parents) || !Array.isArray(result.subtasks)) {
        throw new Error(result.error || "ClickUp өгөгдөл татаж чадсангүй.");
      }
      setData(result);
      setPersonId(current => current === "all" || result.people.some(person => person.id === current) ? current : "all");
      setPage(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ClickUp өгөгдөл татаж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <TeamSidebar open={mobileMenu} onClose={() => setMobileMenu(false)} />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div className="breadcrumb"><span>CX team</span><ArrowRight size={14} /><strong>ClickUp таск</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="period-select" aria-label="Тайлангийн жил сонгох"><CalendarDays size={16} /> 2026 он <ChevronDown size={14} /></button>
            <ReportDownload data={data} filters={filters} />
          </div>
        </header>

        <div className="content-wrap clickup-page-wrap">
          <CxReportNav active="tasks" />
          <section className="hero clickup-page-hero">
            <div className="eyebrow"><span /> CX DEV.TEAM · SAVED SNAPSHOT</div>
            <div className="hero-row">
              <div><h1>ClickUp таск<span>.</span></h1><p>Бүх complete subtask-ийг сар, ажилтан, Type-аар шүүж, дэлгэрэнгүйг үзэх болон тайлан татах боломжтой.</p></div>
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

            {error && (
              <div className="clickup-error">
                <span><X size={18} /></span><div><strong>Өгөгдөл татагдсангүй</strong><p>{error}</p></div>
                <button onClick={() => void loadData(true)}>Дахин оролдох</button>
              </div>
            )}
            {(data || loading) && (
              <>
                <div className="clickup-stats">
                  <div><span className="clickup-stat-icon purple"><Layers3 size={17} /></span><span><small>2026 DAILY TASK PARENT</small><strong>{loading ? "—" : formatNumber(new Set(filteredTasks.map(task => task.parentId)).size)}</strong></span></div>
                  <div><span className="clickup-stat-icon green"><CheckCircle2 size={17} /></span><span><small>COMPLETE SUBTASK</small><strong>{loading ? "—" : formatNumber(stats.tasks)}</strong></span></div>
                  <div><span className="clickup-stat-icon orange"><ListChecks size={17} /></span><span><small>TYPE БҮРТГЭЛТЭЙ</small><strong>{loading ? "—" : formatNumber(filteredTasks.filter(task => task.type).length)}</strong></span></div>
                  <div><span className="clickup-stat-icon blue"><Clock3 size={17} /></span><span><small>TIME ESTIMATE</small><strong>{loading ? "—" : formatDuration(stats.estimateMs)}</strong></span></div>
                </div>

                <div className="person-selector" role="group" aria-label="CX Dev.Team ажилтан сонгох">
                  {!loading && <button className={`person-card ${personId === "all" ? "active" : ""}`} aria-pressed={personId === "all"} onClick={() => { setPersonId("all"); setPage(1); }}><span className="person-avatar all-people"><Users size={20} /></span><span className="person-card-copy"><small>CX DEV.TEAM</small><strong>Бүх ажилтан</strong></span><span className="person-task-count"><strong>{formatNumber(data?.subtasks.length || 0)}</strong><small>ажил</small></span></button>}
                  {loading
                    ? Array.from({ length: 4 }).map((_, index) => <span className="person-card person-card-loading" key={index} />)
                    : (data?.people || []).map((person) => (
                        <button
                          className={`person-card ${selectedPerson?.id === person.id ? "active" : ""}`}
                          key={person.id}
                          onClick={() => { setPersonId(person.id); setPage(1); }}
                          aria-pressed={selectedPerson?.id === person.id}
                        >
                          <span className="person-avatar" style={{ background: person.color || "#168c80" }}>{person.avatar ? <img src={person.avatar} alt="" /> : person.name.slice(0, 1).toUpperCase()}</span>
                          <span className="person-card-copy"><small>2026 · COMPLETE</small><strong>{person.name}</strong></span>
                          <span className="person-task-count"><strong>{formatNumber(person.completeSubtasks)}</strong><small>subtask</small></span>
                        </button>
                      ))}
                </div>

                <div className="clickup-toolbar">
                  <label className="task-search">
                    <Search size={15} />
                    <input value={search} aria-label="Ажлын ID, нэр, ажилтан эсвэл Type хайх" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Ажлын ID, нэр, ажилтан эсвэл Type хайх" />
                    {search && <button onClick={() => { setSearch(""); setPage(1); }} aria-label="Хайлт цэвэрлэх"><X size={14} /></button>}
                  </label>
                  <label className="status-filter">
                    <span>Type</span>
                    <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
                      <option value="all">Бүх Type</option>
                      {availableTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <label className="status-filter"><span>Сар</span><select value={monthFilter} onChange={event => { setMonthFilter(event.target.value); setPage(1); }}><option value="all">Бүх сар</option>{availableMonths.map(month => <option key={month} value={month}>{Number(month)}-р сар</option>)}</select><ChevronDown size={14} /></label>
                  <button className="reset-filters" onClick={resetFilters}>Шүүлтүүр цэвэрлэх</button>
                  <span className="filter-result" role="status">{formatNumber(filteredTasks.length)} / {formatNumber(data?.subtasks.length || 0)} ажил</span>
                </div>

                <div className="clickup-table-wrap" tabIndex={0} role="region" aria-label="Бүх ClickUp ажлын хүснэгт">
                  <table className="clickup-table">
                    <thead><tr><th scope="col">Ажил / ID</th><th scope="col">Assignment</th><th>Status</th><th>Type</th><th>Due date</th><th>Time estimate</th></tr></thead>
                    <tbody>
                      {loading
                        ? Array.from({ length: 8 }).map((_, index) => <tr className="task-loading-row" key={index}><td colSpan={6}><span style={{ animationDelay: `${index * 80}ms` }} /></td></tr>)
                        : visibleTasks.map((task, index) => (
                            <tr className="subtask-row" key={task.id} style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}>
                              <td className="task-identity"><a href={`https://app.clickup.com/t/${encodeURIComponent(task.id)}`} target="_blank" rel="noreferrer"><strong>{task.name || task.id}</strong><ExternalLink size={13} /></a>{task.name && <small>{task.id}</small>}</td>
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

                <nav className="table-pagination" aria-label="Ажлын хуудаслалт">
                  <label>Хуудас бүрд <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                  <span aria-live="polite">{filteredTasks.length ? formatNumber(pageStart + 1) : 0}–{formatNumber(Math.min(pageStart + pageSize, filteredTasks.length))} / {formatNumber(filteredTasks.length)} ажил</span>
                  <div><button disabled={currentPage === 1} onClick={() => setPage(1)} aria-label="Эхний хуудас">Эхний</button><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Өмнөх хуудас"><ChevronLeft size={16} /></button><label><span className="sr-only">Хуудас сонгох</span><select value={currentPage} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} / {pageCount}</option>)}</select></label><button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Дараагийн хуудас"><ChevronRight size={16} /></button><button disabled={currentPage === pageCount} onClick={() => setPage(pageCount)} aria-label="Сүүлийн хуудас">Сүүлийн</button></div>
                </nav>
                <div className="clickup-footnote"><span><span className="online-dot" />{data ? `${formatDate(String(new Date(data.syncedAt).getTime()), true)}-д синк хийсэн` : "Өгөгдөл уншиж байна"}</span><span>{data?.partial ? "Эх сурвалжийн зарим өгөгдөл дутуу" : "Бүх хадгалсан ажил хуудас бүрд нээлттэй"} · Экспортод бүх тохирох ажил багтана</span></div>
              </>
            )}
          </section>

          <footer className="report-footer"><span>ClickUp task report · 2026</span><span>Refresh товч дарахад shared snapshot шинэчлэгдэнэ.</span></footer>
        </div>
      </main>
    </div>
  );
}
