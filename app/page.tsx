"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  LayoutDashboard,
  Layers3,
  ListChecks,
  LoaderCircle,
  Menu,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MonthKey = string;

type Month = {
  key: MonthKey;
  short: string;
  label: string;
  tasks: number;
  minutes: number;
  estimatedTasks: number;
};

type Category = {
  id: string;
  name: string;
  shortName: string;
  tasks: number;
  minutes: number;
  estimatedTasks: number;
  color: string;
  icon: typeof ListChecks;
  description: string;
  members: Array<{ name: string; tasks: number }>;
};

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
  workspace: { id: string; name: string; color: string; memberCount: number };
  list: { id: string; name: string };
  reportYear: number;
  people: ClickUpPerson[];
  parents: ClickUpParent[];
  subtasks: ClickUpSubtask[];
  summary: {
    dailyTaskParents: number;
    completeSubtasks: number;
    withType: number;
    withEstimate: number;
    estimateMs: number;
  };
  dataQuality: {
    missingAssignment: number;
    missingStatus: number;
    missingType: number;
    missingDueDate: number;
    missingTimeEstimate: number;
  };
  partial: boolean;
  syncedAt: string;
  cacheSource?: "snapshot" | "clickup";
};

const CLICKUP_PAGE_SIZE = 50;
const MONTH_SHORTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const CATEGORY_COLORS = ["#ff6b4a", "#7c5cff", "#168c80", "#2676e8", "#ee9d2b", "#48a561", "#d8588f", "#67758d"];
const EMPTY_SUMMARY = "ClickUp-ийн live өгөгдөл синк хийгдсэний дараа сарын нэгтгэл автоматаар шинэчлэгдэнэ.";

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value);
}

function formatMinutes(value: number, compact = false) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return compact ? `${formatNumber(hours)}ц ${minutes}м` : `${formatNumber(hours)} цаг ${minutes} мин`;
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

function formatApiDuration(value: number | null) {
  if (!value) return "—";
  const totalMinutes = Math.round(value / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} мин`;
  return `${hours}ц ${minutes}м`;
}

function percentChange(current: number, previous: number) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function monthKeyFromDate(value: string | null) {
  if (!value) return "";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getUTCMonth() + 1).padStart(2, "0");
}

function buildMonths(tasks: ClickUpSubtask[]): Month[] {
  const buckets = Array.from({ length: 12 }, () => ({ tasks: 0, estimateMs: 0, estimatedTasks: 0 }));
  for (const task of tasks) {
    const monthIndex = Number(monthKeyFromDate(task.dueDate)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    buckets[monthIndex].tasks += 1;
    if (task.timeEstimate) {
      buckets[monthIndex].estimateMs += task.timeEstimate;
      buckets[monthIndex].estimatedTasks += 1;
    }
  }

  return buckets.map((bucket, index) => ({
    key: String(index + 1).padStart(2, "0"),
    short: MONTH_SHORTS[index],
    label: `${index + 1} дүгээр сар`,
    tasks: bucket.tasks,
    minutes: Math.round(bucket.estimateMs / 60_000),
    estimatedTasks: bucket.estimatedTasks,
  }));
}

function categoryIcon(name: string) {
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes("meeting")) return Users;
  if (normalized.includes("call") || normalized.includes("chat") || normalized.includes("email")) return MessageSquareText;
  if (normalized.includes("bug") || normalized.includes("incident") || normalized.includes("imp-")) return Target;
  if (normalized.includes("support")) return CheckCircle2;
  if (normalized.includes("training") || normalized.includes("study") || normalized.includes("test")) return Zap;
  return ListChecks;
}

function buildCategories(tasks: ClickUpSubtask[], monthKey: MonthKey): Category[] {
  const buckets = new Map<string, {
    tasks: number;
    estimateMs: number;
    estimatedTasks: number;
    color: string;
    members: Map<string, number>;
  }>();

  for (const task of tasks) {
    if (monthKeyFromDate(task.dueDate) !== monthKey) continue;
    const typeName = task.type?.name || "Тодорхойгүй";
    const bucket = buckets.get(typeName) || {
      tasks: 0,
      estimateMs: 0,
      estimatedTasks: 0,
      color: task.type?.color || CATEGORY_COLORS[buckets.size % CATEGORY_COLORS.length],
      members: new Map<string, number>(),
    };
    bucket.tasks += 1;
    if (task.timeEstimate) {
      bucket.estimateMs += task.timeEstimate;
      bucket.estimatedTasks += 1;
    }
    for (const assignee of task.assignment) {
      bucket.members.set(assignee.name, (bucket.members.get(assignee.name) || 0) + 1);
    }
    buckets.set(typeName, bucket);
  }

  return Array.from(buckets.entries())
    .map(([name, bucket]) => ({
      id: name,
      name,
      shortName: name,
      tasks: bucket.tasks,
      minutes: Math.round(bucket.estimateMs / 60_000),
      estimatedTasks: bucket.estimatedTasks,
      color: bucket.color,
      icon: categoryIcon(name),
      description: `ClickUp-ийн Type талбар дахь “${name}” ангиллын ${monthKey}-р сарын live гүйцэтгэл.`,
      members: Array.from(bucket.members.entries())
        .map(([memberName, memberTasks]) => ({ name: memberName, tasks: memberTasks }))
        .sort((a, b) => b.tasks - a.tasks),
    }))
    .sort((a, b) => b.tasks - a.tasks);
}

function sumMonths(items: Month[]) {
  return items.reduce(
    (total, item) => ({
      tasks: total.tasks + item.tasks,
      minutes: total.minutes + item.minutes,
      estimatedTasks: total.estimatedTasks + item.estimatedTasks,
    }),
    { tasks: 0, minutes: 0, estimatedTasks: 0 },
  );
}

function preparedSummary(month: Month, previous: Month, categories: Category[]) {
  if (!month.tasks) return `${month.label}-д ClickUp дээр complete subtask бүртгэгдээгүй байна.`;
  const leader = categories[0];
  const average = month.minutes / Math.max(month.estimatedTasks, 1);
  const comparison = previous.tasks
    ? `${previous.label}-тай харьцуулахад ажлын тоо ${Math.abs(month.tasks - previous.tasks)}-аар ${month.tasks >= previous.tasks ? "өссөн" : "буурсан"}.`
    : "Өмнөх сард харьцуулах complete subtask бүртгэгдээгүй байна.";
  return `${month.label}-д ClickUp-ээс ${formatNumber(month.tasks)} complete subtask синк хийгдэж, ${formatMinutes(month.minutes)} time estimate бүртгэгдсэн байна. ${comparison}\n\nХамгийн олон ажилтай Type нь ${leader?.shortName || "—"}: ${formatNumber(leader?.tasks || 0)} subtask, ${formatMinutes(leader?.minutes || 0)} estimate-тэй. Ангиллын тоо болон хугацаа нь ClickUp-ийн Type, Due date, Time estimate талбараас шууд тооцогдоно.\n\nTime estimate оруулсан ${formatNumber(month.estimatedTasks)} task-д нэг ажил дунджаар ${average.toFixed(1)} минут байна. Estimate оруулаагүй task-ийг дундаж хугацааны хуваарьт оруулаагүй.`;
}

function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  const positive = value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${positive ? "positive" : "negative"}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {suffix || signed(value)}
    </span>
  );
}

export default function Home() {
  const [selectedMonthKey, setSelectedMonthKey] = useState<MonthKey>("01");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [summaryMonth, setSummaryMonth] = useState<MonthKey>("01");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarySource, setSummarySource] = useState<"prepared" | "groq" | "local">("prepared");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [clickUpData, setClickUpData] = useState<ClickUpPayload | null>(null);
  const [clickUpLoading, setClickUpLoading] = useState(true);
  const [clickUpError, setClickUpError] = useState("");
  const [clickUpSearch, setClickUpSearch] = useState("");
  const [clickUpPerson, setClickUpPerson] = useState("");
  const [clickUpType, setClickUpType] = useState("all");
  const [clickUpPage, setClickUpPage] = useState(1);

  const months = useMemo(() => buildMonths(clickUpData?.subtasks || []), [clickUpData]);
  const availableMonths = useMemo(() => months.filter((item) => item.tasks > 0), [months]);
  const displayMonths = availableMonths.length > 0 ? availableMonths : months.slice(0, 8);
  const monthIndex = months.findIndex((month) => month.key === selectedMonthKey);
  const safeMonthIndex = Math.max(0, monthIndex);
  const month = months[safeMonthIndex];
  const previous = months[Math.max(0, safeMonthIndex - 1)];
  const categories = useMemo(() => buildCategories(clickUpData?.subtasks || [], month.key), [clickUpData, month.key]);
  const previousCategories = useMemo(() => buildCategories(clickUpData?.subtasks || [], previous.key), [clickUpData, previous.key]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const topCategory = categories[0] || null;
  const taskDelta = safeMonthIndex === 0 ? 0 : percentChange(month.tasks, previous.tasks);
  const timeDelta = safeMonthIndex === 0 ? 0 : percentChange(month.minutes, previous.minutes);
  const averageMinutes = month.minutes / Math.max(month.estimatedTasks, 1);
  const previousAverage = previous.minutes / Math.max(previous.estimatedTasks, 1);
  const chartMax = Math.max(100, Math.ceil(Math.max(1, ...displayMonths.map((item) => item.tasks)) / 100) * 100);
  const maxCategoryTasks = Math.max(1, ...categories.map((item) => item.tasks));
  const yearTotals = sumMonths(months);
  const firstHalf = sumMonths(months.slice(0, 6));
  const secondHalf = sumMonths(months.slice(6));
  const latestMonth = availableMonths[availableMonths.length - 1] || months[0];
  const latestMonthNumber = Number(latestMonth.key);
  const secondHalfLabel = latestMonthNumber >= 7 ? `VII–${latestMonth.short}` : "VII–XII";
  const firstHalfRate = firstHalf.minutes ? firstHalf.tasks / (firstHalf.minutes / 60) : 0;
  const secondHalfRate = secondHalf.minutes ? secondHalf.tasks / (secondHalf.minutes / 60) : 0;
  const summaryIsCurrent = summaryMonth === selectedMonthKey;
  const selectedClickUpPerson = clickUpData?.people.find((person) => person.id === clickUpPerson) || clickUpData?.people[0] || null;
  const clickUpTypes = useMemo(() => {
    const parentIds = new Set(selectedClickUpPerson?.parentIds || []);
    return Array.from(new Set(
      (clickUpData?.subtasks || [])
        .filter((task) => parentIds.has(task.parentId))
        .map((task) => task.type?.name)
        .filter((name): name is string => Boolean(name)),
    )).sort();
  }, [clickUpData, selectedClickUpPerson]);
  const filteredClickUpTasks = useMemo(() => {
    const query = clickUpSearch.trim().toLocaleLowerCase("mn-MN");
    const parentIds = new Set(selectedClickUpPerson?.parentIds || []);
    return (clickUpData?.subtasks || []).filter((task) => {
      const matchesPerson = parentIds.has(task.parentId);
      const matchesType = clickUpType === "all" || task.type?.name === clickUpType;
      const haystack = [task.parentName, task.type?.name, ...task.assignment.map((item) => item.name)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("mn-MN");
      return matchesPerson && matchesType && (!query || haystack.includes(query));
    });
  }, [clickUpData, clickUpSearch, clickUpType, selectedClickUpPerson]);
  const clickUpPageCount = Math.max(1, Math.ceil(filteredClickUpTasks.length / CLICKUP_PAGE_SIZE));
  const visibleClickUpTasks = filteredClickUpTasks.slice(
    (clickUpPage - 1) * CLICKUP_PAGE_SIZE,
    clickUpPage * CLICKUP_PAGE_SIZE,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedCategoryId(null);
        setMobileMenu(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    void loadClickUp(false);
  }, []);

  useEffect(() => {
    setClickUpPage(1);
  }, [clickUpPerson, clickUpSearch, clickUpType]);

  useEffect(() => {
    if (!clickUpData) return;
    setSummary(preparedSummary(month, previous, categories));
    setSummaryMonth(month.key);
    setSummarySource("prepared");
  }, [categories, clickUpData, month, previous]);

  async function loadClickUp(refresh = false) {
    setClickUpLoading(true);
    setClickUpError("");
    try {
      const response = await fetch(refresh ? "/api/clickup?refresh=1" : "/api/clickup", { cache: "no-store" });
      const result = (await response.json()) as ClickUpPayload & { error?: string };
      if (!response.ok || !result.workspace || !Array.isArray(result.people) || !Array.isArray(result.parents) || !Array.isArray(result.subtasks)) {
        throw new Error(result.error || "ClickUp өгөгдөл татаж чадсангүй.");
      }
      setClickUpData(result);
      setClickUpPerson((current) => result.people.some((person) => person.id === current) ? current : result.people[0]?.id || "");
      const latestMonthKey = result.subtasks.reduce((latest, task) => {
        const key = monthKeyFromDate(task.dueDate);
        return key > latest ? key : latest;
      }, "01");
      setSelectedMonthKey(latestMonthKey);
      setClickUpPage(1);
    } catch (error) {
      setClickUpError(error instanceof Error ? error.message : "ClickUp өгөгдөл татаж чадсангүй.");
    } finally {
      setClickUpLoading(false);
    }
  }

  async function generateSummary() {
    setIsSummarizing(true);
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: `2026 оны ${month.label}`,
          current: { tasks: month.tasks, minutes: month.minutes, averageMinutes },
          previous:
            safeMonthIndex > 0 && previous.tasks > 0
              ? {
                  period: `2026 оны ${previous.label}`,
                  tasks: previous.tasks,
                  minutes: previous.minutes,
                  averageMinutes: previousAverage,
                }
              : null,
          categories: categories.map(({ name, shortName, tasks, minutes }) => ({
            name,
            shortName,
            tasks,
            minutes,
          })),
          previousCategories:
            safeMonthIndex > 0 && previous.tasks > 0
              ? previousCategories.map(({ name, shortName, tasks, minutes }) => ({
                  name,
                  shortName,
                  tasks,
                  minutes,
                }))
              : null,
          halfYear: {
            previous: { period: "2026 оны 1–6 сар", tasks: firstHalf.tasks, minutes: firstHalf.minutes },
            current: { period: `2026 оны 7–${latestMonthNumber} сар`, tasks: secondHalf.tasks, minutes: secondHalf.minutes },
          },
        }),
      });
      const result = (await response.json()) as { summary?: string; source?: "groq" | "local"; error?: string };
      if (!response.ok || !result.summary) throw new Error(result.error || "Нэгтгэл үүссэнгүй");
      setSummary(result.summary);
      setSummaryMonth(selectedMonthKey);
      setSummarySource(result.source ?? "groq");
    } catch {
      setSummary(preparedSummary(month, previous, categories));
      setSummaryMonth(selectedMonthKey);
      setSummarySource("local");
    } finally {
      setIsSummarizing(false);
    }
  }

  function selectMonth(key: MonthKey) {
    setSelectedMonthKey(key);
    setSelectedCategoryId(null);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`} aria-label="Үндсэн цэс">
        <div className="brand">
          <span className="brand-logo-wrap">
            <img className="brand-logo" src="/cody-logo.svg" alt="Cody" width="151" height="59" />
          </span>
        </div>
        <nav className="nav-list">
          <a className="nav-item active" href="#overview" onClick={() => setMobileMenu(false)}>
            <LayoutDashboard size={19} /> <span>Хураангуй</span>
          </a>
          <a className="nav-item" href="#workload" onClick={() => setMobileMenu(false)}>
            <ListChecks size={19} /> <span>Ажлын төрөл</span>
          </a>
          <a className="nav-item" href="#clickup" onClick={() => setMobileMenu(false)}>
            <Layers3 size={19} /> <span>ClickUp таск</span>
          </a>
          <a className="nav-item" href="#comparison" onClick={() => setMobileMenu(false)}>
            <TrendingUp size={19} /> <span>Харьцуулалт</span>
          </a>
          <a className="nav-item" href="#ai-summary" onClick={() => setMobileMenu(false)}>
            <Sparkles size={19} /> <span>AI нэгтгэл</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <div className="sidebar-note-icon"><Bot size={18} /></div>
          <div><strong>Groq AI</strong><span>Монгол тайланг секундэд нэгтгэнэ</span></div>
        </div>
        <div className="sidebar-footer"><span className="online-dot" />{clickUpLoading ? "Хадгалсан data уншиж байна" : clickUpError ? "ClickUp холболт тасарсан" : "ClickUp хадгалсан data"}</div>
      </aside>

      {mobileMenu && <button className="menu-backdrop" onClick={() => setMobileMenu(false)} aria-label="Цэс хаах" />}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Тайлан</span><ArrowRight size={14} /><strong>Сарын гүйцэтгэл</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="period-select" aria-label="Тайлангийн жил сонгох">
              <CalendarDays size={16} /> 2026 он <ChevronDown size={14} />
            </button>
            <button className="export-button" onClick={() => window.print()}><Download size={16} /> <span>Тайлан татах</span></button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="hero" id="overview">
            <div className="eyebrow"><span /> ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ</div>
            <div className="hero-row">
              <div>
                <h1>Ажлын тайлан<span>.</span></h1>
                <p>ClickUp-ийн complete subtask, Type болон time estimate-ээс автоматаар тооцов.</p>
              </div>
              <div className="month-switcher" aria-label="Сар сонгох">
                {displayMonths.map((item) => (
                  <button key={item.key} className={selectedMonthKey === item.key ? "selected" : ""} onClick={() => selectMonth(item.key)}>
                    {item.short}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="kpi-grid" aria-label="Гол үзүүлэлтүүд">
            <article className="kpi-card primary-card">
              <div className="kpi-head"><span>Гүйцэтгэсэн ажил</span><div className="kpi-icon"><CheckCircle2 size={20} /></div></div>
              <div className="kpi-value">{formatNumber(month.tasks)}</div>
              <div className="kpi-foot">
                {previous.tasks > 0 ? <><Delta value={taskDelta} /><span>өмнөх сараас</span></> : <span>ClickUp live data</span>}
              </div>
              <div className="card-glow" />
            </article>
            <article className="kpi-card">
              <div className="kpi-head"><span>Нийт time estimate</span><div className="kpi-icon blue"><Clock3 size={20} /></div></div>
              <div className="kpi-value time-value">{formatMinutes(month.minutes, true)}</div>
              <div className="kpi-foot">
                {previous.minutes > 0 ? <><Delta value={timeDelta} /><span>өмнөх сараас</span></> : <span>{formatNumber(month.estimatedTasks)} task estimate-тэй</span>}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-head"><span>Нэг ажилд</span><div className="kpi-icon green"><Zap size={20} /></div></div>
              <div className="kpi-value">{averageMinutes.toFixed(1)}<small> мин</small></div>
              <div className="kpi-foot">
                {previous.estimatedTasks > 0 ? <><Delta value={percentChange(averageMinutes, previousAverage)} suffix={`${(averageMinutes - previousAverage).toFixed(1)} мин`} /><span>estimate-тэй task</span></> : <span>estimate-тэй task-ийн дундаж</span>}
              </div>
            </article>
            <article className="kpi-card emphasis-card">
              <div className="kpi-head"><span>Хамгийн идэвхтэй</span><div className="kpi-icon violet"><Target size={20} /></div></div>
              <div className="kpi-value compact-value">{topCategory?.shortName || (clickUpLoading ? "Синк..." : "—")}</div>
              <button className="text-link" disabled={!topCategory} onClick={() => topCategory && setSelectedCategoryId(topCategory.id)}>
                {formatNumber(topCategory?.tasks || 0)} ажил <ArrowRight size={14} />
              </button>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-panel">
              <div className="panel-head">
                <div><span className="panel-kicker">CLICKUP · {displayMonths.length} САР</span><h2>Сарын гүйцэтгэл</h2></div>
                <div className="legend"><span className="legend-dot" />Ажлын тоо</div>
              </div>
              <div className="chart-area" role="img" aria-label={`2026 оны ${displayMonths.length} сарын ClickUp complete subtask график`}>
                <div className="y-labels"><span>{formatNumber(chartMax)}</span><span>{formatNumber(Math.round(chartMax * .75))}</span><span>{formatNumber(Math.round(chartMax * .5))}</span><span>{formatNumber(Math.round(chartMax * .25))}</span><span>0</span></div>
                <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
                <div className="bars">
                  {displayMonths.map((item, index) => (
                    <button key={item.key} className={`bar-group ${selectedMonthKey === item.key ? "active" : ""}`} onClick={() => selectMonth(item.key)} aria-label={`${item.label}: ${item.tasks} ажил`}>
                      <span className="bar-value">{formatNumber(item.tasks)}</span>
                      <span className="bar-track"><span className="bar-fill" style={{ height: `${(item.tasks / chartMax) * 100}%`, animationDelay: `${index * 70}ms` }} /></span>
                      <span className="bar-label">{item.short}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-summary"><TrendingUp size={16} /><span>2026 оны I–{latestMonth.short} сард</span><strong>{formatNumber(yearTotals.tasks)} ажил</strong><span>ClickUp-ээс синк хийгдэв</span></div>
            </article>

            <article className="panel mix-panel" id="workload">
              <div className="panel-head">
                <div><span className="panel-kicker">{month.short} САР · TOP {Math.min(8, categories.length)} TYPE</span><h2>Ажлын ангилал</h2></div>
                <span className="click-hint">Дарж задлах</span>
              </div>
              <div className="category-list">
                {categories.slice(0, 8).map((category) => {
                  const Icon = category.icon;
                  return (
                    <button className="category-row" key={category.id} onClick={() => setSelectedCategoryId(category.id)}>
                      <span className="category-icon" style={{ color: category.color, background: `${category.color}14` }}><Icon size={17} /></span>
                      <span className="category-info"><span className="category-name">{category.shortName}</span><span className="category-track"><i style={{ width: `${(category.tasks / maxCategoryTasks) * 100}%`, background: category.color }} /></span></span>
                      <span className="category-number"><strong>{category.tasks}</strong><small>{formatMinutes(category.minutes, true)}</small></span>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="clickup-panel" id="clickup">
            <div className="clickup-head">
              <div className="clickup-title-row">
                <div className="clickup-logo" aria-hidden="true"><span /><span /><span /></div>
                <div>
                  <div className="clickup-source"><span className="live-pulse" />CLICKUP SAVED SNAPSHOT</div>
                  <h2>{clickUpData?.list.name || "CX Dev.Team"} · 2026 Daily Task</h2>
                  <p>Хамгийн сүүлд гараар шинэчилсэн complete subtask-уудыг харуулж байна.</p>
                </div>
              </div>
              <button className="clickup-refresh" onClick={() => void loadClickUp(true)} disabled={clickUpLoading}>
                <RefreshCw className={clickUpLoading ? "spin" : ""} size={15} />
                {clickUpLoading ? "Шинэчилж байна" : "Шинэчлэх"}
              </button>
            </div>

            {clickUpError ? (
              <div className="clickup-error">
                <span><X size={18} /></span>
                <div><strong>Өгөгдөл татагдсангүй</strong><p>{clickUpError}</p></div>
                <button onClick={() => void loadClickUp(true)}>Дахин оролдох</button>
              </div>
            ) : (
              <>
                <div className="clickup-stats">
                  <div><span className="clickup-stat-icon purple"><Layers3 size={17} /></span><span><small>2026 DAILY TASK PARENT</small><strong>{clickUpLoading ? "—" : formatNumber(selectedClickUpPerson?.parentIds.length || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon green"><CheckCircle2 size={17} /></span><span><small>COMPLETE SUBTASK</small><strong>{clickUpLoading ? "—" : formatNumber(selectedClickUpPerson?.completeSubtasks || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon orange"><ListChecks size={17} /></span><span><small>TYPE БҮРТГЭЛТЭЙ</small><strong>{clickUpLoading ? "—" : formatNumber(selectedClickUpPerson?.withType || 0)}</strong></span></div>
                  <div><span className="clickup-stat-icon blue"><Clock3 size={17} /></span><span><small>TIME ESTIMATE</small><strong>{clickUpLoading ? "—" : formatApiDuration(selectedClickUpPerson?.estimateMs || 0)}</strong></span></div>
                </div>

                <div className="person-selector" role="tablist" aria-label="CX Dev.Team ажилтан сонгох">
                  {clickUpLoading
                    ? Array.from({ length: 4 }).map((_, index) => <span className="person-card person-card-loading" key={index} />)
                    : (clickUpData?.people || []).map((person) => (
                        <button
                          className={`person-card ${selectedClickUpPerson?.id === person.id ? "active" : ""}`}
                          key={person.id}
                          onClick={() => {
                            setClickUpPerson(person.id);
                            setClickUpSearch("");
                            setClickUpType("all");
                          }}
                          role="tab"
                          aria-selected={selectedClickUpPerson?.id === person.id}
                        >
                          <span className="person-avatar" style={{ background: person.color }}>
                            {person.avatar ? <img src={person.avatar} alt="" /> : person.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="person-card-copy"><small>2026 · COMPLETE</small><strong>{person.name}</strong></span>
                          <span className="person-task-count"><strong>{formatNumber(person.completeSubtasks)}</strong><small>subtask</small></span>
                        </button>
                      ))}
                </div>

                <div className="clickup-toolbar">
                  <label className="task-search">
                    <Search size={15} />
                    <input value={clickUpSearch} onChange={(event) => setClickUpSearch(event.target.value)} placeholder="Assignment эсвэл Type-аар хайх" />
                    {clickUpSearch && <button onClick={() => setClickUpSearch("")} aria-label="Хайлт цэвэрлэх"><X size={14} /></button>}
                  </label>
                  <label className="status-filter">
                    <span>Type</span>
                    <select value={clickUpType} onChange={(event) => setClickUpType(event.target.value)}>
                      <option value="all">Бүх Type</option>
                      {clickUpTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <span className="filter-result">{formatNumber(filteredClickUpTasks.length)} үр дүн</span>
                </div>

                <div className="clickup-table-wrap">
                  <table className="clickup-table">
                    <thead>
                      <tr><th>Assignment</th><th>Status</th><th>Type</th><th>Due date</th><th>Time estimate</th></tr>
                    </thead>
                    <tbody>
                      {clickUpLoading
                        ? Array.from({ length: 6 }).map((_, index) => (
                            <tr className="task-loading-row" key={index}><td colSpan={5}><span style={{ animationDelay: `${index * 80}ms` }} /></td></tr>
                          ))
                        : visibleClickUpTasks.map((task, index) => (
                            <tr className="subtask-row" key={task.id} style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}>
                              <td>
                                <div className="subtask-assignment">
                                  <div className="assignee-stack">
                                    {task.assignment.length > 0 ? task.assignment.slice(0, 3).map((assignee) => <span key={`${task.id}-${assignee.id}`} title={assignee.name} style={{ background: assignee.color }}>{assignee.name.slice(0, 1).toUpperCase()}</span>) : <em>—</em>}
                                  </div>
                                  <span><strong>{task.assignment.map((item) => item.name).join(", ") || "—"}</strong><small>{task.parentName}</small></span>
                                </div>
                              </td>
                              <td><span className="api-status" style={{ color: task.status.color, background: `${task.status.color}16` }}><i style={{ background: task.status.color }} />{task.status.name}</span></td>
                              <td>{task.type ? <span className="type-badge" style={{ color: task.type.color, background: `${task.type.color}14` }}><i style={{ background: task.type.color }} />{task.type.name}</span> : <span className="empty-value">Тодорхойгүй</span>}</td>
                              <td><span className="due-date">{formatDate(task.dueDate)}</span></td>
                              <td><span className={`estimate-cell ${task.timeEstimate ? "" : "missing-estimate"}`}><Clock3 size={13} />{task.timeEstimate ? formatApiDuration(task.timeEstimate) : "Оруулаагүй"}</span></td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                  {!clickUpLoading && filteredClickUpTasks.length === 0 && <div className="empty-tasks"><Search size={21} /><strong>Тохирох subtask олдсонгүй</strong><span>Хайлт эсвэл шүүлтүүрээ өөрчилнө үү.</span></div>}
                </div>
                {!clickUpLoading && filteredClickUpTasks.length > 0 && (
                  <div className="table-pagination">
                    <span>{formatNumber((clickUpPage - 1) * CLICKUP_PAGE_SIZE + 1)}–{formatNumber(Math.min(clickUpPage * CLICKUP_PAGE_SIZE, filteredClickUpTasks.length))} / {formatNumber(filteredClickUpTasks.length)}</span>
                    <div>
                      <button onClick={() => setClickUpPage((page) => Math.max(1, page - 1))} disabled={clickUpPage === 1}>Өмнөх</button>
                      <strong>{clickUpPage} / {clickUpPageCount}</strong>
                      <button onClick={() => setClickUpPage((page) => Math.min(clickUpPageCount, page + 1))} disabled={clickUpPage === clickUpPageCount}>Дараах</button>
                    </div>
                  </div>
                )}
                <div className="clickup-footnote">
                  <span><span className="online-dot" />{clickUpData ? `${formatDate(String(new Date(clickUpData.syncedAt).getTime()), true)}-д синк хийсэн` : "API холболт"}</span>
                  <span>{selectedClickUpPerson?.name || "4 ажилтан"} · {clickUpData?.reportYear || 2026} оны data{clickUpData?.partial ? " · Зарим parent task түр татагдсангүй" : clickUpData?.cacheSource === "clickup" ? " · ClickUp-ээс шинээр татсан" : " · Хадгалсан snapshot"}{clickUpData?.dataQuality.missingTimeEstimate ? ` · ${clickUpData.dataQuality.missingTimeEstimate} task-д estimate оруулаагүй` : ""}</span>
                </div>
              </>
            )}
          </section>

          <section className="ai-panel" id="ai-summary">
            <div className="ai-orb"><Sparkles size={25} /><span /></div>
            <div className="ai-content">
              <div className="ai-heading">
                <div><span className="ai-label">GROQ AI · CLICKUP LIVE</span><h2>{summaryIsCurrent ? month.label : "Сонгосон сар"} — гол дүгнэлт</h2></div>
                <button className="summarize-button" onClick={generateSummary} disabled={isSummarizing}>
                  {isSummarizing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={15} />}
                  {isSummarizing ? "Нэгтгэж байна" : summaryIsCurrent ? "Дахин нэгтгэх" : "Энэ сарыг нэгтгэх"}
                </button>
              </div>
              <div className={`summary-text ${isSummarizing ? "loading" : ""}`}>
                {summary.split(/\n\s*\n/).map((paragraph, index) => <p key={`${summaryMonth}-${index}`}>{paragraph}</p>)}
              </div>
              <div className="ai-meta"><span className="online-dot" />{summarySource === "groq" ? "Groq загвараар шинээр боловсруулав" : summarySource === "local" ? "Бэлтгэсэн нэгтгэл ашиглав" : "Өгөгдөлд суурилсан бэлтгэсэн дүгнэлт"}<span className="meta-separator" />Тоон үзүүлэлтийг автоматаар шалгасан</div>
            </div>
          </section>

          <section className="comparison-section" id="comparison">
            <div className="section-title"><div><span className="panel-kicker">CLICKUP LIVE ХАРЬЦУУЛАЛТ</span><h2>2026 оны хагас жилийн хөдөлгөөн</h2></div><p>Due date-аар I–VI сар болон VII–{latestMonth.short} сарын complete subtask-ийг харьцуулав.</p></div>
            <div className="comparison-grid">
              <article className="period-card muted-period">
                <div className="period-head"><span>ЭХНИЙ ХАГАС</span><strong>2026 · I–VI</strong></div>
                <div className="period-stats"><div><small>НИЙТ АЖИЛ</small><strong>{formatNumber(firstHalf.tasks)}</strong></div><div><small>TIME ESTIMATE</small><strong>{formatMinutes(firstHalf.minutes, true)}</strong></div></div>
                <div className="period-rate"><span>Нэг estimate цагт</span><strong>{firstHalfRate.toFixed(2)} ажил</strong></div>
              </article>
              <div className="comparison-arrow"><ArrowRight size={21} /><span>H1 → H2</span></div>
              <article className="period-card current-period">
                <div className="period-head"><span>ХОЁР ДАХЬ ХАГАС · ОДОО</span><strong>2026 · {secondHalfLabel}</strong></div>
                <div className="period-stats"><div><small>НИЙТ АЖИЛ</small><strong>{formatNumber(secondHalf.tasks)}</strong>{firstHalf.tasks > 0 && <Delta value={percentChange(secondHalf.tasks, firstHalf.tasks)} />}</div><div><small>TIME ESTIMATE</small><strong>{formatMinutes(secondHalf.minutes, true)}</strong>{firstHalf.minutes > 0 && <Delta value={percentChange(secondHalf.minutes, firstHalf.minutes)} />}</div></div>
                <div className="period-rate"><span>Нэг estimate цагт</span><strong>{secondHalfRate.toFixed(2)} ажил</strong>{firstHalfRate > 0 && <span className="rate-chip">{signed(percentChange(secondHalfRate, firstHalfRate))}</span>}</div>
              </article>
            </div>
          </section>

          <footer className="report-footer">
            <span>Ажлын гүйцэтгэлийн тайлан · 2026</span>
            <span>Цагийн өгөгдөлд 60-аас давсан минутыг зөв хэлбэрт шилжүүлэн тооцов.</span>
          </footer>
        </div>
      </main>

      <div className={`drawer-backdrop ${selectedCategory ? "visible" : ""}`} onClick={() => setSelectedCategoryId(null)} />
      <aside className={`detail-drawer ${selectedCategory ? "open" : ""}`} aria-hidden={!selectedCategory} aria-label="Ангиллын дэлгэрэнгүй">
        {selectedCategory && (
          <>
            <div className="drawer-head">
              <span className="drawer-category-icon" style={{ color: selectedCategory.color, background: `${selectedCategory.color}16` }}><selectedCategory.icon size={22} /></span>
              <button className="icon-button" onClick={() => setSelectedCategoryId(null)} aria-label="Дэлгэрэнгүй хаах"><X size={20} /></button>
            </div>
            <span className="panel-kicker">{selectedCategory.shortName}</span>
            <h2>{selectedCategory.name}</h2>
            <p className="drawer-description">{selectedCategory.description}</p>
            <div className="drawer-stats">
              <div><small>ГҮЙЦЭТГЭСЭН</small><strong>{formatNumber(selectedCategory.tasks)}</strong><span>ажил</span></div>
              <div><small>TIME ESTIMATE</small><strong>{formatMinutes(selectedCategory.minutes, true)}</strong><span>{selectedCategory.estimatedTasks} task</span></div>
            </div>
            <div className="drawer-average"><Clock3 size={16} /><span>Estimate-тэй нэг ажилд</span><strong>{(selectedCategory.minutes / Math.max(selectedCategory.estimatedTasks, 1)).toFixed(1)} мин</strong></div>
            <div className="drawer-tasks">
              <div className="drawer-section-title"><span>Ажилтны оролцоо</span><small>{month.label}</small></div>
              {selectedCategory.members.map((member) => (
                <div className="task-item" key={member.name}>
                  <span className="task-check"><CheckCircle2 size={15} /></span>
                  <div><strong>{member.name}</strong><small>{formatNumber(member.tasks)} complete subtask</small></div>
                </div>
              ))}
            </div>
            <div className="drawer-callout"><Sparkles size={17} /><span>ClickUp sync шинэчлэгдэхэд энэ Type-ийн үзүүлэлт автоматаар дахин тооцогдоно.</span></div>
          </>
        )}
      </aside>
    </div>
  );
}
