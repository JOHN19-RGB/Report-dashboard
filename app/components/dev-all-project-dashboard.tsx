"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  Flag,
  FolderKanban,
  LayoutGrid,
  List,
  ListTodo,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clickUpReportLoader, isClickUpSnapshotStale, needsClickUpSprintRefresh } from "../lib/clickup-report-loader";
import {
  parseAllProjectSummary,
  type AllProjectSummary,
  type AllProjectSummaryInput,
} from "../lib/all-project-summary";
import {
  buildSprintPeriods,
  DEV_PROJECT_STATUSES,
  DEV_REPORT_END_DATE,
  DEV_REPORT_END_YEAR,
  DEV_REPORT_START_DATE,
  DEV_REPORT_START_YEAR,
  devProjectName,
  devProjectStatus,
  devProjectWorkstream,
  filterDevTasksByMonthKeys,
  formatSprintDateRange,
  groupDevAllProjectTasks,
  isDevReportData,
  nextDevProjectSort,
  scopeDevReportTasks,
  selectDevTasks,
  topLevelDevTasks,
  type DevProjectStatusKey,
  type DevProjectSort,
  type DevProjectSortKey,
  type DevReportData,
  type DevReportFilters,
  type DevSprintPeriodMode,
  type DevTask,
} from "../lib/dev-report";
import TeamSidebar from "./team-sidebar";

const DEFAULT_FILTERS: DevReportFilters = { search: "", startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE, taskType: "all", sprintIds: [] };
const REPORT_YEARS = Array.from({ length: DEV_REPORT_END_YEAR - DEV_REPORT_START_YEAR + 1 }, (_, index) => String(DEV_REPORT_START_YEAR + index));
const REPORT_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

function currentProjectStatus(statuses: Record<DevProjectStatusKey, number>) {
  const key = (["hold", "qa", "inProgress", "todo", "done"] as DevProjectStatusKey[]).find(status => statuses[status] > 0) || "done";
  return DEV_PROJECT_STATUSES.find(status => status.key === key)!;
}

function formatSyncDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("mn-MN") || "—";
}

function formatEstimate(value: number) {
  if (!value) return "—";
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round(value % 3_600_000 / 60_000);
  return `${hours ? `${hours}ц ` : ""}${minutes ? `${minutes}м` : ""}`.trim() || "—";
}

function formatNarrativeDuration(value: number) {
  const totalMinutes = Math.round(value / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours} цаг` : "", minutes ? `${minutes} минут` : ""].filter(Boolean).join(" ");
}

function priorityLabel(value: string | undefined) {
  return value?.trim() || "Priority байхгүй";
}

type AllProjectDirectoryItem = ReturnType<typeof groupDevAllProjectTasks>[number];

function ProjectDetail({ project, subtasks }: { project: AllProjectDirectoryItem; subtasks?: DevTask[] }) {
  const cardDetail = subtasks !== undefined;
  const detailTasks = subtasks ?? project.subtasks;
  const detailStatuses = Object.fromEntries(DEV_PROJECT_STATUSES.map(status => [status.key, detailTasks.filter(task => devProjectStatus(task) === status.key).length])) as Record<DevProjectStatusKey, number>;
  const detailStatus = detailTasks.length ? currentProjectStatus(detailStatuses) : null;
  return <div className={`all-project-detail${cardDetail ? " all-project-card-detail" : ""}`}>
    {detailTasks.length ? <div className="all-project-subtasks">
      {cardDetail ? <div className="all-project-card-detail-heading">
        <div><span><ListTodo size={16} /></span><div><strong>Dev / Design ажлууд</strong><small>Хариуцагч болон ажлын хугацааны мэдээлэл</small></div></div>
        <b>{detailTasks.length} ажил</b>
      </div> : <div className="all-project-subtasks-heading">
        <div className="all-project-subtasks-title">
          <span><ListTodo size={16} /></span>
          <div><small>ТӨСЛИЙН ДЭД АЖЛУУД</small><strong>{project.name}</strong></div>
        </div>
        <div className="all-project-subtasks-meta">
          <b>{detailTasks.length} ажил</b>
          {detailStatus && <i className={`status-${detailStatus.key}`}><em style={{ background: detailStatus.color }} />{detailStatus.label}</i>}
        </div>
      </div>}
      {cardDetail ? <div className="all-project-card-task-grid">{detailTasks.map((task, index) => {
        const status = DEV_PROJECT_STATUSES.find(item => item.key === devProjectStatus(task))!;
        const title = task.name.includes("|") ? task.name.split("|").slice(1).join("|").trim() : task.name;
        const assignees = task.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй";
        const workstream = devProjectWorkstream(task) === "dev" ? "DEV" : "DESIGN";
        return <article className="all-project-card-task" style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }} key={task.id}>
          <header>
            <span className="all-project-subtask-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="all-project-subtask-copy"><small>{workstream}</small><strong>{title || "Дэд ажил"}</strong></span>
            <span className={`all-project-task-status status-${devProjectStatus(task)}`}><i style={{ background: status.color }} />{status.label}</span>
          </header>
          <dl>
            <div><dt>Хариуцагч</dt><dd>{assignees}</dd></div>
            <div><dt>Эхэлсэн</dt><dd>{formatDate(task.startDate || task.createdDate)}</dd></div>
            <div><dt>Дуусах</dt><dd>{formatDate(task.dueDate)}</dd></div>
          </dl>
        </article>;
      })}</div> : <><div className="all-project-subtasks-columns" aria-hidden="true"><span /><span>Ажил</span><span>Хариуцагч</span><span>Төлөв</span><span /></div>{detailTasks.map((task, index) => {
      const status = DEV_PROJECT_STATUSES.find(item => item.key === devProjectStatus(task))!;
      const title = task.name.includes("|") ? task.name.split("|").slice(1).join("|").trim() : task.name;
      const assignees = task.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй";
      const workstream = devProjectWorkstream(task) === "dev" ? "DEV" : devProjectWorkstream(task) === "design" ? "DESIGN" : "PROJECT";
      return <details className="all-project-subtask" key={task.id}>
        <summary>
          <span className="all-project-subtask-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="all-project-subtask-copy"><small>{workstream}</small><strong>{title || "Дэд ажил"}</strong></span>
          <span className="all-project-subtask-owner">{assignees}</span>
          <span className={`all-project-task-status status-${devProjectStatus(task)}`}><i style={{ background: status.color }} />{status.label}</span>
          <span className="all-project-subtask-chevron"><ChevronDown size={14} /></span>
        </summary>
        <div className="all-project-subtask-body">
          <dl>
            <div><dt>Хариуцагч</dt><dd>{assignees}</dd></div>
            <div><dt>Эхэлсэн</dt><dd>{formatDate(task.startDate || task.createdDate)}</dd></div>
            <div><dt>Дуусах</dt><dd>{formatDate(task.dueDate)}</dd></div>
            <div><dt>Тооцоолсон цаг</dt><dd>{formatEstimate(task.timeEstimateMs || 0)}</dd></div>
            <div><dt>Priority</dt><dd><span className={`all-project-priority priority-${(task.priority || "none").toLocaleLowerCase("en-US")}`}>{priorityLabel(task.priority)}</span></dd></div>
            <div className="all-project-detail-sprint"><dt>Sprint</dt><dd title={task.sprint || undefined}>{task.sprint || "Sprint холбогдоогүй"}</dd></div>
          </dl>
          {task.url && <a href={task.url} target="_blank" rel="noreferrer">ClickUp дээр нээх <ExternalLink size={12} /></a>}
        </div>
      </details>;
    })}</>}</div> : <div className="all-project-detail-empty"><span><ListTodo size={18} /></span><div><strong>{cardDetail ? "Dev / Design ажил алга" : "Дэд ажил алга"}</strong><small>{cardDetail ? "Энэ төсөлд харуулах Dev эсвэл Design ажил одоогоор бүртгэгдээгүй байна." : "Энэ төсөлд бүртгэлтэй дэд ажил одоогоор алга."}</small></div></div>}
  </div>;
}

function periodSelectionLabel(years: string[], months: string[]) {
  if (!years.length && !months.length) return "Сонголтгүй";
  const yearLabel = !years.length ? "Жил сонгоогүй" : years.length === REPORT_YEARS.length ? `${REPORT_YEARS[0]}–${REPORT_YEARS.at(-1)}` : years.join(", ");
  const monthLabel = !months.length ? "Сар сонгоогүй" : months.length === REPORT_MONTHS.length ? "Бүх сар" : months.length === 1 ? `${Number(months[0])}-р сар` : `${months.length} сар`;
  return `${yearLabel} · ${monthLabel}`;
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadProjects(tasks: DevTask[]) {
  const headers = ["Project", "Task", "Status", "Status group", "Task type", "Sprint", "Assignees", "Start date", "Due date", "Updated at", "ClickUp URL"];
  const rows = tasks.map(task => [
    devProjectName(task),
    task.name,
    task.status.name,
    DEV_PROJECT_STATUSES.find(status => status.key === devProjectStatus(task))?.label || "To do",
    task.type,
    task.sprint,
    task.assignees.map(assignee => assignee.name).join(", "),
    task.startDate,
    task.dueDate,
    task.updatedAt,
    task.url,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Dev-All-Project-${DEV_REPORT_START_YEAR}-${DEV_REPORT_END_YEAR}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DevAllProjectDashboard() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<DevReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<DevReportFilters>(DEFAULT_FILTERS);
  const [periodYears, setPeriodYears] = useState(REPORT_YEARS);
  const [periodMonths, setPeriodMonths] = useState(REPORT_MONTHS);
  const [periodMode, setPeriodMode] = useState<DevSprintPeriodMode>("segment");
  const [projectView, setProjectView] = useState<"list" | "card">("list");
  const [projectSort, setProjectSort] = useState<DevProjectSort>({ key: "status", direction: "asc" });
  const [workstream, setWorkstream] = useState<"dev" | "design" | "project">("project");
  const [generatedProjectSummary, setGeneratedProjectSummary] = useState<{ key: string; summary: AllProjectSummary; source: "groq" | "local" } | null>(null);
  const [projectSummaryLoadingKey, setProjectSummaryLoadingKey] = useState<string | null>(null);
  const [projectSummaryError, setProjectSummaryError] = useState<{ key: string; message: string } | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const projectSummaryRequestRef = useRef(0);
  const projectSummaryAbortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError("");
    let refreshSprints = false;
    function applyPayload(payload: DevReportData) {
      refreshSprints ||= needsClickUpSprintRefresh(payload);
      const normalizeTasks = (tasks: DevTask[]) => tasks.map(task => ({ ...task, tags: Array.isArray(task.tags) ? task.tags : [], sprintIds: Array.isArray(task.sprintIds) ? task.sprintIds : [], updatedAt: task.updatedAt || null, priority: task.priority || "" }));
      const normalizedPayload: DevReportData = {
        ...payload,
        sprints: Array.isArray(payload.sprints) ? payload.sprints : [],
        tasks: scopeDevReportTasks(normalizeTasks(payload.tasks)),
        allProjectTasks: normalizeTasks(Array.isArray(payload.allProjectTasks) ? payload.allProjectTasks : []),
      };
      setData(normalizedPayload);
      setFilters(current => ({
        ...current,
        sprintIds: current.sprintIds.filter(id => normalizedPayload.sprints.some(sprint => sprint.id === id)),
        taskType: current.taskType === "all" || normalizedPayload.allProjectTasks?.some(task => task.type === current.taskType) ? current.taskType : "all",
      }));
    }
    try {
      const path = "/api/clickup/dev?view=all-project";
      const refreshPath = "/api/clickup/dev?refresh=all-project&view=all-project";
      let payload = await clickUpReportLoader.read(refresh ? refreshPath : path, isDevReportData);
      clickUpReportLoader.remember(path, payload);
      applyPayload(payload);
      if (!refresh && isClickUpSnapshotStale(payload.allProjectTaskSyncedAt || payload.syncedAt)) {
        payload = await clickUpReportLoader.read(refreshPath, isDevReportData);
        clickUpReportLoader.remember(path, payload);
        applyPayload(payload);
      }
      if (refreshSprints || needsClickUpSprintRefresh(payload)) {
        const sprintPayload = await clickUpReportLoader.read("/api/clickup/dev?refresh=recent-sprints&view=all-project", isDevReportData);
        clickUpReportLoader.remember(path, sprintPayload);
        applyPayload(sprintPayload);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "All Projects list-ийн мэдээлэл татагдсангүй.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadData(false); });
    return () => { active = false; };
  }, [loadData]);

  useEffect(() => {
    const closeMenus = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickedMenu = target instanceof Element ? target.closest("details") : null;
      const clickedInsideFilters = Boolean(filterBarRef.current?.contains(target));
      filterBarRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => {
        if (!clickedInsideFilters || menu !== clickedMenu) menu.open = false;
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") filterBarRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => { menu.open = false; });
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("focusin", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("focusin", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const periodMonthKeys = useMemo(() => periodYears.flatMap(year => periodMonths.map(month => `${year}-${month}`)).sort(), [periodMonths, periodYears]);
  const allProjectData = useMemo(() => data ? { ...data, tasks: data.allProjectTasks || [] } : null, [data]);
  const matchingRecords = useMemo(() => {
    const selected = allProjectData ? selectDevTasks(allProjectData, filters) : [];
    return filters.sprintIds.length ? selected : filterDevTasksByMonthKeys(selected, periodMonthKeys);
  }, [allProjectData, filters, periodMonthKeys]);
  const sprints = useMemo(() => data?.sprints || [], [data?.sprints]);
  const periods = useMemo(() => buildSprintPeriods(sprints, periodMode), [periodMode, sprints]);
  const selectedPeriods = useMemo(() => periods.filter(period => period.sprintIds.every(id => filters.sprintIds.includes(id))), [filters.sprintIds, periods]);
  const selectionLabel = !selectedPeriods.length ? "All Sprints" : selectedPeriods.length <= 2 ? selectedPeriods.map(period => period.label.replace(/^Sprint /, "")).join(", ") : `${selectedPeriods.length} Sprint groups`;
  const matchingRecordIds = useMemo(() => new Set(matchingRecords.map(task => task.id)), [matchingRecords]);
  const projects = useMemo(() => {
    const context = allProjectData?.tasks || [];
    const matchedIds = new Set(topLevelDevTasks(matchingRecords).map(task => task.id));
    const grouped = groupDevAllProjectTasks(context, context).filter(project => matchedIds.has(project.id));
    if (!projectSort) return grouped;
    return grouped.sort((a, b) => {
      let comparison = 0;
      if (projectSort.key === "project") comparison = a.name.localeCompare(b.name, "mn", { numeric: true, sensitivity: "base" });
      if (projectSort.key === "status") comparison = DEV_PROJECT_STATUSES.findIndex(status => status.key === currentProjectStatus(a.statuses).key) - DEV_PROJECT_STATUSES.findIndex(status => status.key === currentProjectStatus(b.statuses).key);
      if (projectSort.key === "tasks") comparison = a.subtasks.length - b.subtasks.length;
      if (projectSort.key === "completion") comparison = a.completion - b.completion;
      if (projectSort.key === "updated") comparison = a.latestDate.localeCompare(b.latestDate);
      if (!comparison) comparison = a.name.localeCompare(b.name, "mn", { numeric: true, sensitivity: "base" });
      return projectSort.direction === "asc" ? comparison : -comparison;
    });
  }, [allProjectData, matchingRecords, projectSort]);
  const projectRoots = useMemo(() => projects.map(project => project.rootTask), [projects]);
  const chartProjects = useMemo(() => workstream === "project"
    ? projects
    : projects.filter(project => project.subtasks.some(task => matchingRecordIds.has(task.id) && devProjectWorkstream(task) === workstream)), [matchingRecordIds, projects, workstream]);
  const chartTasks = useMemo(() => chartProjects.map(project => project.rootTask), [chartProjects]);
  const projectStatusCounts = useMemo(() => {
    const counts = Object.fromEntries(DEV_PROJECT_STATUSES.map(status => [status.key, 0])) as Record<DevProjectStatusKey, number>;
    for (const task of projectRoots) counts[devProjectStatus(task)] += 1;
    return counts;
  }, [projectRoots]);
  const summaryProjectsByStatus = useMemo(() => {
    const grouped: Record<DevProjectStatusKey, DevTask[]> = { todo: [], inProgress: [], qa: [], hold: [], done: [] };
    for (const task of projectRoots) grouped[devProjectStatus(task)].push(task);
    return grouped;
  }, [projectRoots]);
  const chartStatusCounts = useMemo(() => {
    const counts = Object.fromEntries(DEV_PROJECT_STATUSES.map(status => [status.key, 0])) as Record<DevProjectStatusKey, number>;
    for (const task of chartTasks) counts[devProjectStatus(task)] += 1;
    return counts;
  }, [chartTasks]);
  const done = projectStatusCounts.done;
  const ongoing = projectRoots.length - done;
  const completion = projectRoots.length ? Math.round(done / projectRoots.length * 100) : 0;
  const planningTasks = useMemo(() => projectRoots.filter(task => devProjectStatus(task) === "todo").sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || devProjectName(a).localeCompare(devProjectName(b), "mn")), [projectRoots]);
  const doneEstimateMs = useMemo(() => projects
    .filter(project => devProjectStatus(project.rootTask) === "done")
    .flatMap(project => project.subtasks)
    .filter(task => matchingRecordIds.has(task.id))
    .reduce((sum, task) => sum + (task.timeEstimateMs || 0), 0), [matchingRecordIds, projects]);
  const summaryPeriod = selectedPeriods.length === 1
    ? `${selectedPeriods[0].label.replace(/^Sprint /, "")} дугаар спринтийн`
    : selectedPeriods.length > 1
      ? `${selectedPeriods.length} сонгосон спринтийн`
      : `${periodSelectionLabel(periodYears, periodMonths)} хугацааны`;
  const allProjectSummaryInput = useMemo<AllProjectSummaryInput>(() => ({
    period: summaryPeriod,
    totalProjects: projectRoots.length,
    doneEstimateMinutes: Math.round(doneEstimateMs / 60_000),
    statuses: { ...projectStatusCounts },
    partial: data?.partial === true,
  }), [data?.partial, doneEstimateMs, projectRoots.length, projectStatusCounts, summaryPeriod]);
  const allProjectSummaryKey = useMemo(() => JSON.stringify(allProjectSummaryInput), [allProjectSummaryInput]);
  const currentProjectSummary = generatedProjectSummary?.key === allProjectSummaryKey ? generatedProjectSummary : null;
  const projectSummaryLoading = projectSummaryLoadingKey === allProjectSummaryKey;
  const currentProjectSummaryError = projectSummaryError?.key === allProjectSummaryKey ? projectSummaryError.message : "";
  const hasPeriodFilter = periodYears.length !== REPORT_YEARS.length || periodMonths.length !== REPORT_MONTHS.length;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) || hasPeriodFilter;
  const statusSummary = DEV_PROJECT_STATUSES.reduce<Array<(typeof DEV_PROJECT_STATUSES)[number] & { count: number; share: number; start: number; end: number }>>((summary, status) => {
    const count = chartStatusCounts[status.key];
    const share = chartTasks.length ? count / chartTasks.length * 100 : 0;
    const start = summary.at(-1)?.end || 0;
    summary.push({ ...status, count, share, start, end: start + share });
    return summary;
  }, []);
  const donut = chartTasks.length ? statusSummary.map(status => `${status.color} ${status.start}% ${status.end}%`).join(", ") : "#edf0f6 0% 100%";

  useEffect(() => {
    projectSummaryRequestRef.current += 1;
    projectSummaryAbortRef.current?.abort();
    projectSummaryAbortRef.current = null;
    return () => projectSummaryAbortRef.current?.abort();
  }, [allProjectSummaryKey]);

  async function generateAllProjectSummary() {
    if (projectSummaryLoading || !projectRoots.length) return;
    projectSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    projectSummaryAbortRef.current = controller;
    const requestId = ++projectSummaryRequestRef.current;
    const requestKey = allProjectSummaryKey;
    setProjectSummaryLoadingKey(requestKey);
    setProjectSummaryError(null);
    try {
      const response = await fetch("/api/summarize/dev/all-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(allProjectSummaryInput),
      });
      const result = await response.json() as { summary?: unknown; source?: "groq" | "local"; error?: string };
      const summary = parseAllProjectSummary(result.summary);
      if (!response.ok || !summary || JSON.stringify(summary.facts) !== requestKey) throw new Error(result.error || "AI дүгнэлт үүссэнгүй.");
      if (projectSummaryRequestRef.current === requestId && requestKey === allProjectSummaryKey) {
        setGeneratedProjectSummary({ key: requestKey, summary, source: result.source === "groq" ? "groq" : "local" });
      }
    } catch (loadError) {
      if (controller.signal.aborted || projectSummaryRequestRef.current !== requestId) return;
      setProjectSummaryError({ key: requestKey, message: loadError instanceof Error ? loadError.message : "AI дүгнэлт үүссэнгүй." });
    } finally {
      if (projectSummaryRequestRef.current === requestId) setProjectSummaryLoadingKey(null);
    }
  }

  function updateFilter<Key extends keyof DevReportFilters>(key: Key, value: DevReportFilters[Key]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function applyPeriodSelection(years: string[], months: string[]) {
    const sortedYears = [...years].sort();
    const sortedMonths = [...months].sort();
    const firstYear = sortedYears[0] || REPORT_YEARS[0];
    const lastYear = sortedYears.at(-1) || REPORT_YEARS.at(-1)!;
    setPeriodYears(sortedYears);
    setPeriodMonths(sortedMonths);
    setFilters(current => ({ ...current, startDate: `${firstYear}-01-01`, endDate: `${lastYear}-12-31`, sprintIds: [] }));
  }

  function applySprints(sprintIds: string[]) {
    if (!sprintIds.length) {
      const firstYear = periodYears[0] || REPORT_YEARS[0];
      const lastYear = periodYears.at(-1) || REPORT_YEARS.at(-1)!;
      setFilters(current => ({ ...current, startDate: `${firstYear}-01-01`, endDate: `${lastYear}-12-31`, sprintIds: [] }));
      return;
    }
    const selected = sprints.filter(item => sprintIds.includes(item.id));
    const starts = selected.map(item => item.startDate || DEV_REPORT_START_DATE).sort();
    const ends = selected.map(item => item.endDate || DEV_REPORT_END_DATE).sort();
    setFilters(current => ({ ...current, sprintIds, startDate: starts[0] > DEV_REPORT_START_DATE ? starts[0] : DEV_REPORT_START_DATE, endDate: ends.at(-1)! < DEV_REPORT_END_DATE ? ends.at(-1)! : DEV_REPORT_END_DATE }));
  }

  function toggleSprintPeriod(id: string) {
    const selectedIds = selectedPeriods.map(period => period.id);
    const next = selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id];
    applySprints(periods.filter(period => next.includes(period.id)).flatMap(period => period.sprintIds));
  }

  function resetFilters() {
    setPeriodYears(REPORT_YEARS);
    setPeriodMonths(REPORT_MONTHS);
    setFilters(DEFAULT_FILTERS);
  }

  function toggleProjectSort(key: DevProjectSortKey) {
    setProjectSort(current => nextDevProjectSort(current, key));
  }

  function sortIcon(key: DevProjectSortKey) {
    if (projectSort?.key !== key) return <ArrowUpDown size={13} aria-hidden="true" />;
    return projectSort.direction === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
  }

  return <div className="app-shell dev-dashboard dev-all-project-dashboard">
    <TeamSidebar section="dev" page="all-project" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button><div className="breadcrumb"><span>Dev</span><ArrowRight size={14} /><strong>Dev.All Project</strong></div></div></header>
      <div className="content-wrap dev-dashboard-wrap">
        <section className="dev-dashboard-heading">
          <div className="dev-dashboard-heading-top"><div className="hero dev-dashboard-hero"><div className="eyebrow"><span /> DEV TEAM</div><h1>Dev.All Project<span>.</span></h1><p>{data?.allProjectList?.name || "All Projects"} · бүх төслийн төлөв, явц · ClickUp {data ? `сүүлд ${formatSyncDate(data.allProjectTaskSyncedAt || data.taskSyncedAt || data.syncedAt)} шинэчлэгдсэн${loading ? " · Шинэчилж байна" : ""}` : "өгөгдөл уншиж байна"}</p></div></div>
          <div className="dev-dashboard-filters" ref={filterBarRef} aria-label="Dev All Project тайлангийн шүүлтүүр">
            <label className="dev-filter-search"><Search size={16} /><input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Төсөл, таск эсвэл ажилтан хайх" aria-label="All Project тайлангаас хайх" /></label>
            <details className="dev-select-filter dev-period-filter dev-period-multiselect">
              <summary><Clock3 size={17} /><span>Хугацаа:</span><b>{periodSelectionLabel(periodYears, periodMonths)}</b><ChevronDown size={14} /></summary>
              <div className="dev-period-menu">
                <div className="dev-period-menu-actions"><span>Хугацааны сонголт</span><button type="button" onClick={() => applyPeriodSelection([], [])} disabled={!periodYears.length && !periodMonths.length} aria-label="Хугацааны бүх сонголтыг арилгах"><X size={12} />Бүгдийг арилгах</button></div>
                <fieldset><legend><span>Жил</span><button type="button" onClick={() => applyPeriodSelection(REPORT_YEARS, periodMonths)}>Бүгд</button></legend><div className="dev-period-years">{REPORT_YEARS.map(year => <label key={year}><input type="checkbox" checked={periodYears.includes(year)} onChange={() => applyPeriodSelection(periodYears.includes(year) ? periodYears.filter(item => item !== year) : [...periodYears, year], periodMonths)} /><span>{year}</span></label>)}</div></fieldset>
                <fieldset><legend><span>Сар</span><button type="button" onClick={() => applyPeriodSelection(periodYears, REPORT_MONTHS)}>Бүгд</button></legend><div className="dev-period-months">{REPORT_MONTHS.map(month => <label key={month}><input type="checkbox" checked={periodMonths.includes(month)} onChange={() => applyPeriodSelection(periodYears, periodMonths.includes(month) ? periodMonths.filter(item => item !== month) : [...periodMonths, month])} /><span>{Number(month)} сар</span></label>)}</div></fieldset>
              </div>
            </details>
            <details className="dev-select-filter dev-sprint-filter dev-period-multiselect">
              <summary><Flag size={17} /><span>Sprint:</span><b>{selectionLabel}</b><ChevronDown size={14} /></summary>
              <div className="dev-period-menu dev-sprint-menu" aria-label="ClickUp sprint олон сонголт">
                <div className="dev-period-mode" role="group" aria-label="Sprint бүлэглэл"><button type="button" aria-pressed={periodMode === "segment"} onClick={() => { setPeriodMode("segment"); applySprints([]); }}>2 Sprints</button><button type="button" aria-pressed={periodMode === "sprint"} onClick={() => { setPeriodMode("sprint"); applySprints([]); }}>1 Sprint</button></div>
                <label><input type="checkbox" checked={!filters.sprintIds.length} onChange={() => applySprints([])} /><span>All Sprints</span></label>
                <div className="dev-sprint-options">{periods.map(item => <label key={item.id} title={item.complete ? `${item.label} · ${formatSprintDateRange(item.startDate, item.endDate)}` : `Sprint ${item.missingNumbers.join(", ")} дутуу`}><input type="checkbox" checked={selectedPeriods.some(period => period.id === item.id)} disabled={!item.complete} onChange={() => toggleSprintPeriod(item.id)} /><span>{item.label}{!item.complete && <small>Хүлээгдэж байна</small>}</span></label>)}</div>
                {periodMode === "segment" && <p>2 sprint-ээр бүлэглэсэн · 11–12, 13–14, …</p>}
              </div>
            </details>
            {hasFilters && <button className="dev-reset-filter" type="button" onClick={resetFilters} aria-label="Шүүлтүүр цэвэрлэх" title="Шүүлтүүр цэвэрлэх"><X size={16} /></button>}
            <div className="dev-dashboard-actions" role="group" aria-label="All Project тайлангийн үйлдлүүд"><button className="icon-button dev-download-filter" type="button" onClick={() => downloadProjects(matchingRecords)} disabled={loading || !matchingRecords.length} aria-label="Шүүсэн project data татах" title="Шүүсэн project data татах"><Download size={18} /></button><button className="icon-button dev-refresh-filter" type="button" onClick={() => void loadData(true)} disabled={loading} aria-label={loading ? "Өгөгдөл уншиж байна" : "ClickUp өгөгдөл шинэчлэх"} aria-busy={loading}><RefreshCw className={loading ? "spin" : ""} size={18} /></button></div>
          </div>
        </section>

        {error && <div className="clickup-error" role="alert"><span><X size={18} /></span><div><strong>ClickUp өгөгдөл татагдсангүй</strong><p>{error}</p></div><button onClick={() => void loadData(true)}>Дахин оролдох</button></div>}
        {data && !data.allProjectList && <div className="dev-data-warning" role="alert">ClickUp-ийн All Projects list олдсонгүй. Master list-ийн өгөгдлийг энэ хуудсанд орлуулахгүй.</div>}
        {data?.partial && <div className="dev-data-warning" role="status">ClickUp өгөгдлийн хэсэг түр шинэчлэгдээгүй байна. Хамгийн сүүлийн бүрэн snapshot-ийг харуулж байна.</div>}

        <section className="dev-kpi-grid all-project-kpis" aria-label="All Project гол үзүүлэлтүүд">
          <article className="dev-kpi-card"><div><strong>{loading && !data ? "—" : projects.length}</strong><span>Нийт төсөл</span><small><FolderKanban size={12} /> {projects.reduce((sum, project) => sum + project.subtasks.length, 0)} дэд ажил</small></div><span className="dev-kpi-art violet"><FolderKanban size={28} /></span></article>
          <article className="dev-kpi-card"><div><strong>{loading && !data ? "—" : done}</strong><span>Done</span><small><CheckCircle2 size={12} /> ClickUp-ийн дууссан төлөвүүд</small></div><span className="dev-kpi-art green"><CheckCircle2 size={28} /></span></article>
          <article className="dev-kpi-card"><div><strong>{loading && !data ? "—" : `${completion}%`}</strong><span>Гүйцэтгэлийн хувь</span><small>{done} / {projectRoots.length} төсөл</small><span className="dev-kpi-progress"><i style={{ width: `${completion}%` }} /></span></div><span className="dev-progress-ring"><svg viewBox="0 0 66 66" aria-hidden="true"><circle className="dev-ring-track" cx="33" cy="33" r="28" /><circle className="dev-ring-value" cx="33" cy="33" r="28" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - completion} /></svg><b>{completion}%</b></span></article>
          <article className="dev-kpi-card"><div><strong>{loading && !data ? "—" : ongoing}</strong><span>Үргэлжилж буй</span><small>{projectStatusCounts.inProgress} In Progress · {projectStatusCounts.qa} QA test</small></div><span className="dev-kpi-art amber"><RefreshCw size={28} /></span></article>
        </section>

        <section className="dev-panel all-project-status-panel" aria-labelledby="all-project-status-title">
          <header><div><span className="all-project-section-kicker">STATUS OVERVIEW</span><h2 id="all-project-status-title">Төслийн гүйцэтгэлийн төлөв</h2><p>{workstream === "project" ? "Бүх үндсэн төсөл" : workstream === "design" ? "Design ажилтай үндсэн төслүүд" : "Development ажилтай үндсэн төслүүд"} · дэд ажлыг тоонд оруулаагүй</p></div><div className="all-project-status-controls"><nav className="all-project-workstream-tabs" aria-label="Төслийн ажлын урсгал">{(["dev", "design", "project"] as const).map(value => <button type="button" key={value} aria-pressed={workstream === value} onClick={() => setWorkstream(value)}>{value === "dev" ? "Dev" : value === "design" ? "Design" : "Project"}</button>)}</nav><span className="all-project-total-badge">{chartTasks.length} төсөл</span></div></header>
          <div className="all-project-status-layout">
            <div className="all-project-status-visual"><div className="all-project-donut" style={{ background: `conic-gradient(${donut})` }} aria-label={`${chartTasks.length} төслийн төлөв`}><span><strong>{chartTasks.length}</strong><small>Нийт төсөл</small></span></div><div className="all-project-status-highlight"><strong>{chartTasks.length ? Math.round(chartStatusCounts.done / chartTasks.length * 100) : 0}%</strong><span>Done болсон</span><small>{chartTasks.length - chartStatusCounts.done} төсөл үргэлжилж байна</small></div></div>
            <div className="all-project-status-list">{statusSummary.map(status => <div className="all-project-status-row" data-status={status.key} key={status.key}><span className="all-project-status-name"><i style={{ background: status.color }} />{status.label}</span><div className="all-project-status-track"><i style={{ width: `${status.share}%`, background: status.color }} /></div><strong>{status.count}</strong><small>{status.share.toFixed(1)}%</small></div>)}</div>
          </div>
        </section>

        <section className="dev-panel all-project-list-panel" aria-labelledby="all-project-list-title">
          <header><div><span className="all-project-section-kicker">PROJECT DIRECTORY</span><h2 id="all-project-list-title">Төслүүдийн жагсаалт</h2><p>{projects.length} төсөл</p></div><div className="all-project-list-controls"><div className="dev-view-toggle" data-view={projectView} role="group" aria-label="Төслийн харагдац"><button type="button" aria-pressed={projectView === "list"} onClick={() => setProjectView("list")}><List size={14} />List</button><button type="button" aria-pressed={projectView === "card"} onClick={() => setProjectView("card")}><LayoutGrid size={14} />Card</button></div></div></header>
          {projectView === "list" ? <div className="all-project-list" role="table" aria-label="ClickUp төслүүд">
            <div className="all-project-list-head" role="row">
              {([[
                "project", "Төсөл",
              ], ["status", "Төлөв"], ["tasks", "Дэд ажил"], ["completion", "Гүйцэтгэл"], ["updated", "Шинэчлэгдсэн"]] as Array<[DevProjectSortKey, string]>).map(([key, label]) => <span role="columnheader" aria-sort={projectSort?.key === key ? (projectSort.direction === "asc" ? "ascending" : "descending") : "none"} key={key}><button type="button" data-sort-key={key} className={projectSort?.key === key ? "active" : ""} onClick={() => toggleProjectSort(key)} title={`${label}: ${projectSort?.key === key ? projectSort.direction === "asc" ? "өсөхөөр эрэмбэлсэн" : "буурахаар эрэмбэлсэн" : "эрэмбэлээгүй"}. Дарахад дараагийн төлөвт шилжинэ.`}>{label}{sortIcon(key)}</button></span>)}
            </div>
            <div className="all-project-list-scroll" role="rowgroup">{projects.map(project => <details className="all-project-row" key={project.id}>
              <summary>
                <span className="all-project-project">
                  <span className="all-project-disclosure"><ChevronDown size={14} /></span>
                  <span className="all-project-project-icon"><FolderKanban size={16} /></span>
                  <span className="all-project-project-copy"><strong>{project.name}</strong><small>{project.rootTask.sprint || "Sprint холбогдоогүй"}</small></span>
                </span>
                <span className={`all-project-current-status status-${currentProjectStatus(project.statuses).key}`}><i style={{ background: currentProjectStatus(project.statuses).color }} />{currentProjectStatus(project.statuses).label}</span>
                <span className="all-project-task-count"><strong>{project.subtasks.length}</strong><small>таск</small></span>
                <span className="all-project-completion"><i><b style={{ width: `${project.completion}%` }} /></i><strong>{project.completion}%</strong></span>
                <time className="all-project-updated" dateTime={project.latestDate || undefined}><Clock3 size={13} /><span>{project.latestDate ? formatDate(project.latestDate) : "—"}</span></time>
              </summary>
              <ProjectDetail project={project} />
            </details>)}</div>
            {!projects.length && !loading && <p className="dev-no-results">Сонгосон шүүлтүүрт тохирох төсөл олдсонгүй.</p>}
          </div> : <div className="all-project-card-scroll"><div className="all-project-cards">{projects.map(project => {
            const cardSubtasks = project.subtasks.filter(task => ["dev", "design"].includes(devProjectWorkstream(task)));
            const cardDone = cardSubtasks.filter(task => devProjectStatus(task) === "done").length;
            const cardCompletion = cardSubtasks.length ? Math.round(cardDone / cardSubtasks.length * 100) : 0;
            const projectOwner = project.rootTask.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй";
            return <details className="dev-member-card all-project-card" key={project.id}>
              <summary><div className="all-project-card-heading"><span className="all-project-card-icon"><FolderKanban size={18} /></span><div><h3>{project.name}</h3><span>{cardSubtasks.length} Dev / Design ажил · {cardDone} Done</span></div><span className="all-project-card-disclosure"><small>Дэлгэрэнгүй</small><ChevronDown size={15} /></span></div>
              <div className="all-project-card-completion"><span><b>Dev / Design гүйцэтгэл</b><strong>{cardCompletion}%</strong></span><i><b style={{ width: `${cardCompletion}%` }} /></i></div>
              <dl className="all-project-card-meta"><div className="owner"><dt>Хариуцагч</dt><dd title={projectOwner}><i>{initials(projectOwner)}</i><span>{projectOwner}</span></dd></div><div><dt>Эхэлсэн</dt><dd>{formatDate(project.rootTask.startDate || project.rootTask.createdDate)}</dd></div><div><dt>Дуусах</dt><dd>{formatDate(project.rootTask.dueDate)}</dd></div></dl></summary><ProjectDetail project={project} subtasks={cardSubtasks} />
            </details>;
          })}</div>{!projects.length && !loading && <p className="dev-no-results">Сонгосон шүүлтүүрт тохирох төсөл олдсонгүй.</p>}</div>}
        </section>

        <section className="dev-panel all-project-plan-panel" data-empty={!planningTasks.length} aria-labelledby="all-project-plan-title">
          <header><div><span className="all-project-section-kicker">TO DO ROADMAP</span><h2 id="all-project-plan-title">Шинэ төслийн төлөвлөгөө</h2><p>All Projects list-ийн To do төлөвтэй үндсэн төслүүд</p></div><span className="all-project-total-badge">{planningTasks.length} төсөл</span></header>
          {planningTasks.length ? <div className="dev-table-wrap"><table><thead><tr><th>Төсөл</th><th>Хийгдэх ажил</th><th>Хариуцсан ажилтан</th><th>Due date</th></tr></thead><tbody>{planningTasks.map(task => {
            const owner = task.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй";
            return <tr key={task.id}><td><span className="all-project-plan-project"><i><FolderKanban size={14} /></i><strong>{devProjectName(task)}</strong></span></td><td>{task.url ? <a href={task.url} target="_blank" rel="noreferrer">{task.name}<ExternalLink size={12} /></a> : task.name}</td><td><span className="all-project-plan-owner"><i>{initials(owner)}</i>{owner}</span></td><td><time className="all-project-plan-date" dateTime={task.dueDate || undefined}>{formatDate(task.dueDate)}</time></td></tr>;
          })}</tbody></table></div> : <div className="all-project-plan-empty" role="status"><span className="all-project-plan-empty-icon"><ListTodo size={24} /></span><div><strong>{loading && !data ? "Төлөвлөгөө уншиж байна" : "Төлөвлөх шинэ төсөл алга"}</strong><p>{loading && !data ? "ClickUp-ийн All Projects list-ээс To do төслүүдийг татаж байна." : hasFilters ? "Одоогийн шүүлтүүрт тохирох To do төсөл олдсонгүй." : "All Projects list-ийн To do хэсэг одоогоор хоосон байна."}</p></div>{!loading && hasFilters && <button type="button" onClick={resetFilters}><RotateCcw size={14} />Шүүлтүүр цэвэрлэх</button>}</div>}
        </section>

        <section className="dev-panel all-project-summary-panel" aria-labelledby="all-project-summary-title">
          <header><div><span className="all-project-section-kicker">GROQ AI · PROJECT SUMMARY</span><h2 id="all-project-summary-title">{summaryPeriod} төслийн гүйцэтгэлийн дүгнэлт</h2><p>AI найруулга болон ClickUp-аас баталгаажсан үндсэн төслийн үзүүлэлт</p></div><button className="all-project-summary-badge" type="button" disabled={projectSummaryLoading || !projectRoots.length} onClick={() => void generateAllProjectSummary()}>{projectSummaryLoading ? <RefreshCw className="spin" size={14} /> : <Sparkles size={14} />}{projectSummaryLoading ? "Нэгтгэж байна" : currentProjectSummary ? "Дахин нэгтгэх" : "Дүгнэлт гаргах"}</button></header>
          <div className="all-project-summary-content">
            <aside><span>Гүйцэтгэл</span><strong>{completion}%</strong><small>{done} / {projectRoots.length} төсөл Done</small><i><b style={{ width: `${completion}%` }} /></i></aside>
            <article>
              {projectRoots.length ? <>
                {currentProjectSummaryError && <p className="all-project-summary-error" role="alert">{currentProjectSummaryError}</p>}
                <p className="all-project-summary-intro" aria-live="polite">{currentProjectSummary?.summary.introduction && <>{currentProjectSummary.summary.introduction} </>}Тайлант хугацаанд нийт <strong>{projectRoots.length} төсөл</strong> төлөвлөгдөн хийгдсэнээс гүйцэтгэлийн явц <strong>{completion}%</strong>-ийн биелэлттэй байна. Доорх төлөв дээр дарж үндсэн таскуудыг харна уу.</p>
                {([
                  { key: "done", heading: "Дууссан төслүүд", description: `Нийт ${done} төсөл бүрэн дууссан.${doneEstimateMs > 0 ? ` Эдгээр төслийн шууд ажлуудад нийт ${formatNarrativeDuration(doneEstimateMs)} тооцоолсон байна.` : ""}` },
                  { key: "inProgress", heading: "Явцтай төслүүд", description: `${projectStatusCounts.inProgress} төсөл хуваарийн дагуу хэрэгжиж байна.` },
                  { key: "qa", heading: "Шалгалтын шат", description: `${projectStatusCounts.qa} төсөл чанарын шалгалтад байна.` },
                  { key: "hold", heading: "Түр зогссон", description: `${projectStatusCounts.hold} төсөл түр хүлээгдэж байна.` },
                  { key: "todo", heading: "Төлөвлөсөн", description: `${projectStatusCounts.todo} төсөл эхлэхээр төлөвлөгдсөн байна.` },
                ] as Array<{ key: DevProjectStatusKey; heading: string; description: string }>).filter(section => summaryProjectsByStatus[section.key].length).map(section => {
                  const status = DEV_PROJECT_STATUSES.find(item => item.key === section.key)!;
                  const tasks = summaryProjectsByStatus[section.key];
                  const share = Math.round(tasks.length / projectRoots.length * 100);
                  return <details className="all-project-summary-status" data-status={section.key} name="project-summary-status" key={section.key}>
                    <summary>
                      <span className="all-project-summary-status-copy"><i style={{ background: status.color }} /><span><b>{section.heading} ({status.label} — {share}%)</b><small>{section.description}</small></span></span>
                      <span className="all-project-summary-status-action"><b>{tasks.length} таск</b><ChevronDown size={15} /></span>
                    </summary>
                    <div className="all-project-summary-task-list">
                      {tasks.map(task => {
                        const projectName = devProjectName(task);
                        const taskName = task.name.trim() || projectName;
                        const owner = task.assignees.map(person => person.name).join(", ") || "Хариуцагчгүй";
                        return <div className="all-project-summary-task" key={task.id}>
                          <span className="all-project-summary-task-icon"><FolderKanban size={14} /></span>
                          <span className="all-project-summary-task-copy"><strong>{taskName}</strong><small>{projectName !== taskName ? projectName : "Үндсэн таск"}</small></span>
                          <span className="all-project-summary-task-meta owner"><small>Хариуцагч</small><b>{owner}</b></span>
                          <span className="all-project-summary-task-meta sprint"><small>Sprint</small><b>{task.sprint || "Холбогдоогүй"}</b></span>
                          <time className="all-project-summary-task-meta due" dateTime={task.dueDate || undefined}><small>Due date</small><b>{formatDate(task.dueDate)}</b></time>
                          {task.url ? <a href={task.url} target="_blank" rel="noreferrer" aria-label={`${taskName} таскийг ClickUp дээр нээх`}><ExternalLink size={13} /></a> : <span />}
                        </div>;
                      })}
                    </div>
                  </details>;
                })}
              </> : <p>Одоогийн шүүлтүүрт дүгнэх үндсэн төсөл олдсонгүй.</p>}
            </article>
          </div>
        </section>
      </div>
    </main>
  </div>;
}
