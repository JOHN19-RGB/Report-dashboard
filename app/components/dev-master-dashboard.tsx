"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
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
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import TeamSidebar from "./team-sidebar";
import DevTeamProductivity from "./dev-team-productivity";
import DevTeamComparison from "./dev-team-comparison";
import {
  changeRequestRows,
  buildSprintPeriods,
  DEV_REPORT_END_DATE,
  DEV_REPORT_END_YEAR,
  DEV_REPORT_START_DATE,
  DEV_REPORT_START_YEAR,
  DEV_TEAM_ASSIGNEES,
  devTeamPosition,
  filterDevTasksByMonthKeys,
  formatSprintDateRange,
  memberProductivity,
  metricPercentChange,
  monthlyTaskPerformance,
  previousSprintPeriods,
  reportMetrics,
  scopeDevReportTasks,
  selectDevTasks,
  taskDate,
  taskTypeTotals,
  teamCompletionAverage,
  type DevReportData,
  type DevReportFilters,
  type DevSprintPeriodMode,
  type DevTask,
} from "../lib/dev-report";

const TYPE_PALETTE = ["#8bc7ff", "#168df2", "#ffc400", "#30bd63", "#0db9a7", "#7468ff", "#ff7b88", "#64748b"];
const TASK_TYPE_COLORS: Record<string, string> = { Bug: "#ff876d", Imp: "#6d9eff" };

function taskTypeColor(type: string, index: number) {
  return TASK_TYPE_COLORS[type] || TYPE_PALETTE[index % TYPE_PALETTE.length];
}

const DEFAULT_FILTERS: DevReportFilters = { search: "", startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE, taskType: "all", sprintIds: [] };
const REPORT_YEARS = Array.from({ length: DEV_REPORT_END_YEAR - DEV_REPORT_START_YEAR + 1 }, (_, index) => String(DEV_REPORT_START_YEAR + index));
const REPORT_MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

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

function periodSelectionLabel(years: string[], months: string[]) {
  const yearLabel = years.length === REPORT_YEARS.length ? `${REPORT_YEARS[0]}–${REPORT_YEARS.at(-1)}` : years.join(", ");
  const monthLabel = months.length === REPORT_MONTHS.length ? "Бүх сар" : months.length === 1 ? `${Number(months[0])}-р сар` : `${months.length} сар`;
  return `${yearLabel} · ${monthLabel}`;
}

function formatDateRange(startDate: string, endDate: string) {
  const format = (value: string) => value ? value.replaceAll("-", ".") : "—";
  return `${format(startDate)} — ${format(endDate)}`;
}

function MetricComparison({ current, previous, label, reason }: { current: number; previous: number | null; label: string; reason: string }) {
  if (previous === null) return <div className="dev-kpi-comparison unavailable" title={reason}>{reason}</div>;
  const change = metricPercentChange(current, previous);
  const direction = change === null || change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
  const Icon = direction === "negative" ? ArrowDownRight : ArrowUpRight;
  return <div className="dev-kpi-comparison" data-current={current} data-previous={previous} data-change={change ?? "new"} title={`${label}: ${previous.toFixed(1)} → ${current.toFixed(1)}. Одоогийн ClickUp status; sprint төгсөх үеийн архив биш.`}>
    <span className={`delta ${direction}`}>{direction !== "neutral" && <Icon size={11} />}{change === null ? "Шинэ" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</span><span>{label}</span>
  </div>;
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
  const [periodYears, setPeriodYears] = useState(REPORT_YEARS);
  const [periodMonths, setPeriodMonths] = useState(REPORT_MONTHS);
  const [periodMode, setPeriodMode] = useState<DevSprintPeriodMode>("segment");
  const [chartType, setChartType] = useState<"Bug" | "Imp">("Bug");
  const filterBarRef = useRef<HTMLDivElement>(null);
  const periodRangeRef = useRef({ startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE });

  const loadData = useCallback(async (refresh: boolean) => {
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
      setFilters(current => {
        const survivingIds = current.sprintIds.filter(id => normalizedPayload.sprints.some(sprint => sprint.id === id));
        const sprintIds = Array.from(new Set([...survivingIds, ...buildSprintPeriods(normalizedPayload.sprints, "sprint").filter(period => period.sprintIds.some(id => survivingIds.includes(id))).flatMap(period => period.sprintIds)]));
        const lostSprintSelection = current.sprintIds.length > 0 && !sprintIds.length;
        return {
          ...current,
          ...(lostSprintSelection ? periodRangeRef.current : {}),
          taskType: current.taskType === "all" || normalizedPayload.tasks.some(task => task.type === current.taskType) ? current.taskType : "all",
          sprintIds,
        };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "B2C Master list-ийн мэдээлэл татагдсангүй.");
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
    const closeFilterMenus = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickedMenu = target instanceof Element ? target.closest("details") : null;
      const clickedInsideFilters = Boolean(filterBarRef.current?.contains(target));
      filterBarRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => {
        if (!clickedInsideFilters || menu !== clickedMenu) menu.open = false;
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      filterBarRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => { menu.open = false; });
    };
    document.addEventListener("pointerdown", closeFilterMenus);
    document.addEventListener("focusin", closeFilterMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFilterMenus);
      document.removeEventListener("focusin", closeFilterMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const periodMonthKeys = useMemo(() => periodYears.flatMap(year => periodMonths.map(month => `${year}-${month}`)).sort(), [periodMonths, periodYears]);
  const tasks = useMemo(() => {
    const selectedTasks = data ? selectDevTasks(data, filters) : [];
    if (filters.sprintIds.length) return selectedTasks;
    return filterDevTasksByMonthKeys(selectedTasks, periodMonthKeys);
  }, [data, filters, periodMonthKeys]);
  const allTeamTasks = useMemo(() => data ? selectDevTasks(data, DEFAULT_FILTERS) : [], [data]);
  const typeTotals = useMemo(() => taskTypeTotals(tasks), [tasks]);
  const team = useMemo(() => {
    const members = memberProductivity(tasks);
    for (const name of DEV_TEAM_ASSIGNEES) {
      if (!members.some(member => member.name.trim().toLowerCase() === name.toLowerCase())) members.push({ id: name, name, color: "", avatar: null, position: devTeamPosition(name), totalTasks: 0, doneTasks: 0, estimateMs: 0, completion: 0 });
    }
    return members;
  }, [tasks]);
  const monthly = useMemo(() => {
    const monthKeys = filters.sprintIds.length ? Array.from(new Set(tasks.map(task => taskDate(task)?.slice(0, 7)).filter((key): key is string => Boolean(key)))).sort() : periodMonthKeys;
    return monthlyTaskPerformance(tasks, filters.startDate, filters.endDate, monthKeys);
  }, [filters.endDate, filters.sprintIds, filters.startDate, periodMonthKeys, tasks]);
  const changes = useMemo(() => changeRequestRows(tasks), [tasks]);
  const metrics = useMemo(() => reportMetrics(tasks), [tasks]);
  const teamAverage = useMemo(() => teamCompletionAverage(tasks), [tasks]);
  const taskTypes = useMemo(() => Array.from(new Set((data?.tasks || []).map(task => task.type).filter(type => type !== "Тодорхойгүй"))).sort(), [data]);
  const sprints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of data?.tasks || []) {
      for (const sprintId of task.sprintIds) counts.set(sprintId, (counts.get(sprintId) || 0) + 1);
    }
    return (data?.sprints || []).map(sprint => ({ ...sprint, taskCount: counts.get(sprint.id) || 0 }));
  }, [data]);
  const periods = useMemo(() => buildSprintPeriods(sprints, periodMode), [periodMode, sprints]);
  const selectedPeriods = useMemo(() => periods.filter(period => period.sprintIds.every(id => filters.sprintIds.includes(id))), [filters.sprintIds, periods]);
  const selectionLabel = !selectedPeriods.length ? `All ${periodMode === "segment" ? "Segments" : "Sprints"}` : selectedPeriods.length <= 2 ? selectedPeriods.map(period => period.label.replace(/^Sprint /, "")).join(", ") : `${selectedPeriods.length} ${periodMode === "segment" ? "Segments" : "Sprints"}`;
  const periodCardLabel = selectedPeriods.length > 1 ? `${selectedPeriods.length} ${periodMode === "segment" ? "Segments" : "Sprints"}` : selectionLabel;
  const periodLabel = selectedPeriods.length ? `${periodMode === "segment" ? "Segment" : "Sprint"} ${selectionLabel}` : periodSelectionLabel(periodYears, periodMonths);
  const comparison = useMemo(() => {
    const result = previousSprintPeriods(periods, selectedPeriods.map(period => period.id));
    return data?.taskPartial ? { ...result, available: false, reason: "Master task-ийн өгөгдөл дутуу тул харьцуулах боломжгүй" } : result;
  }, [data?.taskPartial, periods, selectedPeriods]);
  const previousTasks = useMemo(() => data && comparison.available ? selectDevTasks(data, { ...filters, sprintIds: comparison.periods.flatMap(period => period.sprintIds) }) : [], [comparison, data, filters]);
  const previousMetrics = useMemo(() => reportMetrics(previousTasks), [previousTasks]);
  const previousAverage = useMemo(() => teamCompletionAverage(previousTasks), [previousTasks]);
  const completionRate = tasks.length ? metrics.doneTasks / tasks.length * 100 : 0;
  const previousCompletionRate = previousTasks.length ? previousMetrics.doneTasks / previousTasks.length * 100 : 0;
  const comparisonLabel = `өмнөх ${selectedPeriods.length > 1 ? `${selectedPeriods.length} ` : ""}${periodMode === "segment" ? "segment" : "sprint"}-ээс`;
  const previousLabel = comparison.periods.map(period => period.label).join(", ");
  const chartItems = useMemo(() => {
    if (!selectedPeriods.length) return monthly.map(item => ({ key: item.key, label: item.month, short: item.month, count: chartType === "Bug" ? item.bug : item.imp, selected: false, sprintIds: [] as string[] }));
    const visible = [...selectedPeriods, ...(comparison.available ? comparison.periods : [])].sort((a, b) => a.firstNumber - b.firstNumber);
    return visible.map(period => {
      const periodTasks = data ? selectDevTasks(data, { ...filters, sprintIds: period.sprintIds }) : [];
      return { key: period.id, label: period.label, short: period.label.replace(/^Sprint /, ""), count: periodTasks.filter(task => task.type === chartType).length, selected: selectedPeriods.some(selected => selected.id === period.id), sprintIds: period.sprintIds };
    });
  }, [chartType, comparison, data, filters, monthly, selectedPeriods]);
  const chartPeak = Math.max(1, ...chartItems.map(item => item.count));
  const chartStep = chartPeak <= 20 ? 4 : chartPeak <= 100 ? 20 : 100;
  const chartMax = Math.ceil(chartPeak / chartStep) * chartStep;
  const chartTotal = tasks.filter(task => task.type === chartType).length;
  const totalTypeCount = typeTotals.reduce((sum, item) => sum + item.count, 0);
  const hasPeriodFilter = periodYears.length !== REPORT_YEARS.length || periodMonths.length !== REPORT_MONTHS.length;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) || hasPeriodFilter;
  let donutPosition = 0;
  const donut = typeTotals.map((item, index) => {
    const start = donutPosition;
    donutPosition += totalTypeCount ? (item.count / totalTypeCount) * 100 : 0;
    return `${taskTypeColor(item.type, index)} ${start}% ${donutPosition}%`;
  }).join(", ");

  function updateFilter<Key extends keyof DevReportFilters>(key: Key, value: DevReportFilters[Key]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function applyPeriodSelection(years: string[], months: string[]) {
    if (!years.length || !months.length) return;
    const sortedYears = [...years].sort();
    const sortedMonths = [...months].sort();
    setPeriodYears(sortedYears);
    setPeriodMonths(sortedMonths);
    periodRangeRef.current = { startDate: `${sortedYears[0]}-01-01`, endDate: `${sortedYears.at(-1)}-12-31` };
    setFilters(current => ({
      ...current,
      startDate: `${sortedYears[0]}-01-01`,
      endDate: `${sortedYears.at(-1)}-12-31`,
      sprintIds: [],
    }));
  }

  function togglePeriodYear(year: string) {
    const next = periodYears.includes(year) ? periodYears.filter(item => item !== year) : [...periodYears, year];
    applyPeriodSelection(next, periodMonths);
  }

  function togglePeriodMonth(month: string) {
    const next = periodMonths.includes(month) ? periodMonths.filter(item => item !== month) : [...periodMonths, month];
    applyPeriodSelection(periodYears, next);
  }

  function applySprints(sprintIds: string[]) {
    if (!sprintIds.length) {
      setFilters(current => ({ ...current, startDate: `${periodYears[0]}-01-01`, endDate: `${periodYears.at(-1)}-12-31`, sprintIds: [] }));
      return;
    }
    const selected = sprints.filter(item => sprintIds.includes(item.id));
    const starts = selected.map(item => item.startDate || DEV_REPORT_START_DATE).sort();
    const ends = selected.map(item => item.endDate || DEV_REPORT_END_DATE).sort();
    const startDate = starts[0] > DEV_REPORT_START_DATE ? starts[0] : DEV_REPORT_START_DATE;
    const endDate = ends.at(-1)! < DEV_REPORT_END_DATE ? ends.at(-1)! : DEV_REPORT_END_DATE;
    setFilters(current => ({ ...current, sprintIds, startDate, endDate }));
  }

  function toggleSprintPeriod(id: string) {
    const selectedIds = selectedPeriods.map(period => period.id);
    const next = selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id];
    applySprints(periods.filter(period => next.includes(period.id)).flatMap(period => period.sprintIds));
  }

  function changePeriodMode(mode: DevSprintPeriodMode) {
    if (mode === periodMode) return;
    applySprints([]);
    setPeriodMode(mode);
  }

  function selectChartItem(item: typeof chartItems[number]) {
    if (item.sprintIds.length) applySprints(item.sprintIds);
    else {
      const [year, month] = item.key.split("-");
      applyPeriodSelection([year], [month]);
    }
  }

  function resetFilters() {
    setPeriodYears(REPORT_YEARS);
    setPeriodMonths(REPORT_MONTHS);
    periodRangeRef.current = { startDate: DEV_REPORT_START_DATE, endDate: DEV_REPORT_END_DATE };
    setFilters(DEFAULT_FILTERS);
  }

  return <div className="app-shell dev-dashboard">
    <TeamSidebar section="dev" page="master" open={mobileMenu} onClose={() => setMobileMenu(false)} />
    <main className="main-content">
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Dev</span><ArrowRight size={14} /><strong>Dev.Master</strong></div>
        </div>
      </header>
      <div className="content-wrap dev-dashboard-wrap">
        <section className="dev-dashboard-heading">
          <div className="dev-dashboard-heading-top">
            <div className="hero dev-dashboard-hero"><div className="eyebrow"><span /> DEV TEAM</div><h1>Dev.Master<span>.</span></h1><p>{data?.list.name || "B2C Master"} · {DEV_REPORT_START_YEAR}–{DEV_REPORT_END_YEAR} · {DEV_TEAM_ASSIGNEES.length} assignee · ClickUp {loading ? "өгөгдөл уншиж байна" : `сүүлд ${formatSyncDate(data?.syncedAt)} шинэчлэгдсэн`}</p></div>
          </div>
          <div className="dev-dashboard-filters" ref={filterBarRef} aria-label="Dev тайлангийн шүүлтүүр">
            <label className="dev-filter-search"><Search size={16} /><input value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Ажил, ажилтан эсвэл төсөл хайх" aria-label="Dev тайлангаас хайх" /></label>
            <details className="dev-select-filter dev-period-filter dev-period-multiselect" title={filters.sprintIds.length ? "Sprint/segment сонгосон үед жил/сар үйлчлэхгүй. Жил эсвэл сар соливол sprint/segment сонголтыг цэвэрлэнэ." : undefined}>
              <summary><Clock3 size={17} /><span>Хугацаа:</span><b>{periodSelectionLabel(periodYears, periodMonths)}</b><ChevronDown size={14} /></summary>
              <div className="dev-period-menu">
                <fieldset><legend><span>Жил</span><button type="button" onClick={() => applyPeriodSelection(REPORT_YEARS, periodMonths)}>Бүгд</button></legend><div className="dev-period-years">{REPORT_YEARS.map(year => <label key={year}><input type="checkbox" checked={periodYears.includes(year)} disabled={periodYears.length === 1 && periodYears.includes(year)} onChange={() => togglePeriodYear(year)} /><span>{year}</span></label>)}</div></fieldset>
                <fieldset><legend><span>Сар</span><button type="button" onClick={() => applyPeriodSelection(periodYears, REPORT_MONTHS)}>Бүгд</button></legend><div className="dev-period-months">{REPORT_MONTHS.map(month => <label key={month}><input type="checkbox" checked={periodMonths.includes(month)} disabled={periodMonths.length === 1 && periodMonths.includes(month)} onChange={() => togglePeriodMonth(month)} /><span>{Number(month)} сар</span></label>)}</div></fieldset>
              </div>
            </details>
            <details className="dev-select-filter dev-sprint-filter dev-period-multiselect">
              <summary><Flag size={17} /><span>{periodMode === "segment" ? "Segment:" : "Sprint:"}</span><b>{selectionLabel}</b><ChevronDown size={14} /></summary>
              <div className="dev-period-menu dev-sprint-menu" aria-label="ClickUp sprint болон segment олон сонголт">
                <div className="dev-period-mode" role="group" aria-label="Sprint эсвэл segment"><button type="button" aria-pressed={periodMode === "segment"} onClick={() => changePeriodMode("segment")}>Segments</button><button type="button" aria-pressed={periodMode === "sprint"} onClick={() => changePeriodMode("sprint")}>Sprints</button></div>
                <label title="Sprint/segment-ийн шүүлтүүргүй. Sprint холбогдоогүй Master ажлууд мөн багтана."><input type="checkbox" checked={!filters.sprintIds.length} onChange={() => applySprints([])} /><span>All {periodMode === "segment" ? "Segments" : "Sprints"}</span></label>
                <div className="dev-sprint-options">{periods.map(item => <label key={item.id} title={item.complete ? `${item.label} · ${formatDateRange(item.startDate || "", item.endDate || "")}` : `Sprint ${item.missingNumbers.join(", ")} хараахан байхгүй — segment бүрдэхийг хүлээж байна`}><input type="checkbox" value={item.id} checked={selectedPeriods.some(period => period.id === item.id)} disabled={!item.complete} onChange={() => toggleSprintPeriod(item.id)} /><span>{item.label}{!item.complete && <small>Хүлээгдэж байна</small>}</span></label>)}</div>
                {periodMode === "segment" && <p>2 sprint = 1 segment · 11–12, 13–14, …</p>}
                {!loading && !sprints.length && <p>ClickUp sprint олдсонгүй</p>}
              </div>
            </details>
            <label className="dev-select-filter dev-type-filter"><ListFilter size={17} /><span>Таск төрөл:</span><select value={filters.taskType} onChange={event => updateFilter("taskType", event.target.value)}><option value="all">All Types</option>{taskTypes.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14} /></label>
            {hasFilters && <button className="dev-reset-filter" onClick={resetFilters}><RotateCcw size={15} /> Цэвэрлэх</button>}
            <div className="dev-dashboard-actions" role="group" aria-label="Dev тайлангийн үйлдлүүд">
              <button className="icon-button dev-download-filter" type="button" onClick={() => downloadAllDevData(allTeamTasks)} disabled={loading || !allTeamTasks.length} aria-label="All data татах" title={`${DEV_REPORT_START_YEAR}–${DEV_REPORT_END_YEAR} оны ${DEV_TEAM_ASSIGNEES.length} assignee-ийн бүх өгөгдөл татах`}><Download size={18} /></button>
              <button className="icon-button dev-refresh-filter" type="button" onClick={() => void loadData(true)} disabled={loading} aria-label={loading ? "Өгөгдөл уншиж байна" : "ClickUp өгөгдөл шинэчлэх"} aria-busy={loading} title={loading ? "Өгөгдөл уншиж байна" : "ClickUp өгөгдөл шинэчлэх"}><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
            </div>
          </div>
        </section>

        {error && <div className="clickup-error" role="alert"><span><X size={18} /></span><div><strong>ClickUp өгөгдөл татагдсангүй</strong><p>{error}</p></div><button onClick={() => void loadData(true)}>Дахин оролдох</button></div>}
        {data?.partial && <div className="dev-data-warning" role="status">{data.taskPartial ? "ClickUp-ийн B2C Master хариу 10,000 ажлын хязгаарт хүрсэн тул хамгийн сүүлийн ажлуудыг харуулж байна." : data.sprintSyncErrors ? `${data.sprintSyncErrors} sprint-ийн мэдээлэл түр шинэчлэгдсэнгүй. Бусад ClickUp өгөгдлийг хэвийн харуулж байна.` : "Зарим sprint 2,000-аас олон ажилтай тул тухайн sprint-ийн хамгийн сүүлийн ажлуудыг харуулж байна."}</div>}

        <section className="dev-kpi-grid" aria-label="Dev төслийн гол үзүүлэлтүүд">
          <article className="dev-kpi-card" data-kpi="total"><div><strong>{loading ? "—" : tasks.length}</strong><span>Нийт таск</span><small><CheckCircle2 size={12} /> {metrics.doneTasks} гүйцэтгэсэн</small>
            {!loading && selectedPeriods.length > 0 && <MetricComparison current={tasks.length} previous={comparison.available ? previousTasks.length : null} label={comparisonLabel} reason={comparison.reason} />}
          </div><span className="dev-kpi-art coral"><ClipboardCheck size={31} /></span></article>
          <article className="dev-kpi-card" data-kpi="completion"><div><strong>{loading ? "—" : `${metrics.objectiveAchievement}%`}</strong><span>Таск гүйцэтгэл<br /></span><small><CheckCircle2 size={12} /> {metrics.doneTasks} / {tasks.length} гүйцэтгэсэн</small>
            {!loading && selectedPeriods.length > 0 && <MetricComparison current={completionRate} previous={comparison.available ? previousCompletionRate : null} label={comparisonLabel} reason={comparison.reason} />}
          </div><span className="dev-progress-ring" style={{ "--progress": `${completionRate * 3.6}deg` } as CSSProperties}><b>{metrics.objectiveAchievement}%</b></span></article>
          <article className="dev-kpi-card" data-kpi="team-average"><div><strong>{loading ? "—" : `${Math.round(teamAverage.average)}%`}</strong><span>Багийн гишүүдийн<br />гүйцэтгэл</span><small title={teamAverage.members.map(member => `${member.name}: ${member.doneTasks}/${member.totalTasks} (${member.completion.toFixed(1)}%)`).join("\n") + "\nАжилгүй гишүүнийг 0% гэж тооцно; 5 гишүүний энгийн дундаж."}><Users size={12} /> 5 assignee average</small><span className="dev-kpi-progress"><i style={{ width: `${teamAverage.average}%` }} /></span>
            {!loading && selectedPeriods.length > 0 && <MetricComparison current={teamAverage.average} previous={comparison.available ? previousAverage.average : null} label={comparisonLabel} reason={comparison.reason} />}
          </div><span className="dev-kpi-art violet"><Gauge size={31} /></span></article>
          <article className="dev-kpi-card dev-sprint-card" data-kpi="period"><div><strong>{loading ? "—" : selectedPeriods.length === 1 ? <>{periodMode === "segment" ? `Segment ${selectedPeriods[0].firstNumber}–${selectedPeriods[0].lastNumber}` : selectedPeriods[0].label}<span className="dev-sprint-card-date" title={formatDateRange(selectedPeriods[0].startDate || "", selectedPeriods[0].endDate || "")}>({formatSprintDateRange(selectedPeriods[0].startDate, selectedPeriods[0].endDate)})</span></> : periodCardLabel}</strong><span>{periodMode === "segment" ? "Segment" : "Sprint"}</span>
            {!loading && selectedPeriods.length > 1 && <div className="dev-sprint-card-ranges" aria-label="Сонгосон sprint-ийн огноо">{selectedPeriods.map(item => <div className="dev-sprint-card-range" key={item.id} title={formatDateRange(item.startDate || "", item.endDate || "")}><b>{item.label}</b><span>{formatSprintDateRange(item.startDate, item.endDate)}</span></div>)}</div>}
            <small>{formatDuration(metrics.estimateMs)} estimate</small></div><span className="dev-kpi-art amber"><TimerReset size={31} /></span></article>
        </section>

        <section className="dev-chart-grid">
          <article className="dev-panel dev-performance-panel" data-task-type={chartType}>
            <header><div><h2>Таск гүйцэтгэлийн харьцуулалт</h2><p>{selectedPeriods.length ? "Сонгосон болон өмнөх үеийн ажлын тоо" : "Сар бүрийн ажлын тоо"}</p></div><div className="dev-chart-type" role="group" aria-label="Графикийн ажлын төрөл"><button type="button" aria-pressed={chartType === "Bug"} onClick={() => setChartType("Bug")}>Bug</button><button type="button" aria-pressed={chartType === "Imp"} onClick={() => setChartType("Imp")}>Improvement</button></div></header>
            <div className="dev-chart-context"><span className="dev-period-badge" title={formatDateRange(filters.startDate, filters.endDate)}><CalendarDays size={14} /> {periodLabel}</span>{comparison.available && <span title={previousLabel}>Өмнөх: {previousLabel}</span>}</div>
            <div className="dev-cx-chart-scroll">
              <div className="chart-area dev-cx-chart" style={{ minWidth: `${Math.max(280, chartItems.length * 46 + 42)}px` }} role="group" aria-label={`${chartType === "Bug" ? "Bug" : "Improvement"} ажлын тоо`}>
                <div className="y-labels"><span>{chartMax}</span><span>{Math.round(chartMax * .75)}</span><span>{Math.round(chartMax * .5)}</span><span>{Math.round(chartMax * .25)}</span><span>0</span></div>
                <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
                <div className="bars">{chartItems.map((item, index) => <button type="button" key={item.key} className={`bar-group ${item.selected ? "active" : ""}`} data-period={item.key} data-count={item.count} data-comparison={selectedPeriods.length && !item.selected ? "previous" : "current"} onClick={() => selectChartItem(item)} aria-label={`${item.label}: ${item.count} ${chartType === "Bug" ? "Bug" : "Improvement"} ажил · ${item.selected ? "Сонгосон үе" : selectedPeriods.length ? "Өмнөх үе" : "Сар"}`} aria-pressed={item.selected}>
                  <span className="bar-value" aria-hidden="true">{item.count}</span><span className="bar-track"><span className="bar-fill" style={{ height: `${item.count / chartMax * 100}%`, minHeight: 0, animationDelay: `${index * 35}ms` }} /></span><span className="bar-label">{item.short}</span>
                </button>)}</div>
              </div>
            </div>
            <div className="chart-summary"><span className="legend-dot" /><strong>{chartTotal} {chartType === "Bug" ? "Bug" : "Improvement"}</strong><span>· {selectedPeriods.length ? "Сонгосон үе" : "Сонгосон хугацаа"}</span>{comparison.available && <span>· Саарал: өмнөх үе</span>}</div>
          </article>

          <article className="dev-panel dev-type-panel">
            <header><h2>Task Type</h2><button aria-label="Task Type нэмэлт цэс"><MoreVertical size={18} /></button></header>
            <div className="dev-donut-layout">
              <div className="dev-donut" style={{ background: totalTypeCount ? `conic-gradient(${donut})` : "#edf1f6" }}><span><strong>{totalTypeCount}</strong><small>tasks</small></span></div>
              <ul aria-label="Таск төрлийн тайлбар">{typeTotals.map((item, index) => <li key={item.type}><span style={{ background: taskTypeColor(item.type, index) }} /><b>{item.type}</b><strong>{item.count}</strong></li>)}</ul>
            </div>
          </article>
        </section>

        <DevTeamProductivity team={team} taskCount={tasks.length} loading={loading} />

        <DevTeamComparison data={data} />

        <section className="dev-panel dev-table-panel dev-change-panel">
          <header><div><h2>Өөрчлөлтийн хүсэлт</h2><p>{changes.length} ажил · хамгийн сүүлийн 5 мөр харагдана, бусдыг гүйлгэж үзнэ</p></div></header>
          <div className="dev-table-wrap"><div className="dev-change-scroll"><table><thead><tr><th>Вэбсайт / Төсөл</th><th>Хийгдсэн ажил</th><th>Хариуцсан ажилтан</th></tr></thead><tbody>{changes.map(request => <tr key={request.id}><td><span className="dev-role-dot" />{request.url ? <a href={request.url} target="_blank" rel="noreferrer">{request.website}</a> : request.website}</td><td>{request.request}</td><td>{request.owner}</td></tr>)}</tbody></table>{!changes.length && !loading && <p className="dev-no-results">Тохирох ажил олдсонгүй.</p>}</div></div>
        </section>
      </div>
    </main>
  </div>;
}
