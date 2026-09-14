"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ListChecks,
  LoaderCircle,
  Menu,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import TeamSidebar from "./components/team-sidebar";
import ReportDownload from "./components/report-download";
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

const MONTH_SHORTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const CATEGORY_COLORS = ["#ff6b4a", "#7c5cff", "#168c80", "#2676e8", "#ee9d2b", "#48a561", "#d8588f", "#67758d"];
const MEMBER_COLORS: Record<string, string> = {
  "Ариунгэрэл": "#168c80",
  "Байгалмаа": "#7c5cff",
  "Мишээл": "#2676e8",
  "Энхбат": "#ff6b4a",
};
const MEMBER_FALLBACK_COLORS = ["#ee9d2b", "#d8588f", "#48a561", "#67758d"];
const EMPTY_SUMMARY = "ClickUp-ийн хадгалсан өгөгдөл уншигдсаны дараа сарын нэгтгэл автоматаар шинэчлэгдэнэ.";

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value);
}

function formatMinutes(value: number, compact = false) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return compact ? `${formatNumber(hours)}ц ${minutes}м` : `${formatNumber(hours)} цаг ${minutes} мин`;
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
      description: `ClickUp-ийн Type талбар дахь “${name}” ангиллын ${monthKey}-р сарын хадгалсан гүйцэтгэл.`,
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

function MemberParticipationPie({ members, monthLabel }: { members: Category["members"]; monthLabel: string }) {
  const total = members.reduce((sum, member) => sum + member.tasks, 0);
  if (!total) {
    return <div className="member-pie-empty">Энэ сард ажилтны оролцооны өгөгдөл бүртгэгдээгүй байна.</div>;
  }

  const segments = members.map((member, index) => {
    const start = members.slice(0, index).reduce((sum, item) => sum + item.tasks, 0) / total * 100;
    const percent = (member.tasks / total) * 100;
    return {
      ...member,
      color: MEMBER_COLORS[member.name] || MEMBER_FALLBACK_COLORS[index % MEMBER_FALLBACK_COLORS.length],
      percent,
      start,
      end: start + percent,
    };
  });
  const chartBackground = `conic-gradient(from -90deg, ${segments
    .map((segment) => `${segment.color} ${segment.start}% ${segment.end}%`)
    .join(", ")})`;
  const chartDescription = segments
    .map((segment) => `${segment.name}: ${formatNumber(segment.tasks)} ажил, ${segment.percent.toFixed(1)} хувь`)
    .join("; ");

  return (
    <div className="member-pie-layout">
      <div className="member-pie-visual">
        <div
          className="member-pie-chart"
          style={{ background: chartBackground }}
          role="img"
          aria-label={`${monthLabel} ажилтны оролцооны pie chart. ${chartDescription}`}
        />
        <div className="member-pie-total"><strong>{formatNumber(total)}</strong><span>нийт subtask</span></div>
      </div>
      <div className="member-pie-legend" aria-label="Ажилтны оролцооны тайлбар">
        {segments.map((segment) => (
          <div className="member-pie-item" key={segment.name}>
            <span className="member-pie-swatch" style={{ background: segment.color }} aria-hidden="true" />
            <div><strong>{segment.name}</strong><small>{formatNumber(segment.tasks)} complete subtask</small></div>
            <b>{segment.percent.toFixed(1)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<{
    text: string;
    monthKey: MonthKey;
    assignment: string;
    source: "groq" | "local";
  } | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [clickUpData, setClickUpData] = useState<ClickUpPayload | null>(null);
  const [clickUpLoading, setClickUpLoading] = useState(true);
  const [clickUpError, setClickUpError] = useState("");
  const [dashboardAssignment, setDashboardAssignment] = useState("all");

  const dashboardTasks = useMemo(() => {
    if (dashboardAssignment === "all") return clickUpData?.subtasks || [];
    const person = clickUpData?.people.find((item) => item.id === dashboardAssignment);
    const parentIds = new Set(person?.parentIds || []);
    return (clickUpData?.subtasks || []).filter((task) => parentIds.has(task.parentId));
  }, [clickUpData, dashboardAssignment]);
  const dashboardAssignmentName = dashboardAssignment === "all"
    ? "Бүх ажилтан"
    : clickUpData?.people.find((item) => item.id === dashboardAssignment)?.name || "Ажилтан";
  const months = useMemo(() => buildMonths(dashboardTasks), [dashboardTasks]);
  const availableMonths = useMemo(() => months.filter((item) => item.tasks > 0), [months]);
  const displayMonths = availableMonths.length > 0 ? availableMonths : months.slice(0, 8);
  const activeMonthKey = availableMonths.some((item) => item.key === selectedMonthKey)
    ? selectedMonthKey
    : availableMonths[availableMonths.length - 1]?.key || selectedMonthKey;
  const monthIndex = months.findIndex((month) => month.key === activeMonthKey);
  const safeMonthIndex = Math.max(0, monthIndex);
  const month = months[safeMonthIndex];
  const previous = months[Math.max(0, safeMonthIndex - 1)];
  const categories = useMemo(() => buildCategories(dashboardTasks, month.key), [dashboardTasks, month.key]);
  const previousCategories = useMemo(() => buildCategories(dashboardTasks, previous.key), [dashboardTasks, previous.key]);
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
  const preparedSummaryText = clickUpData ? preparedSummary(month, previous, categories) : EMPTY_SUMMARY;
  const summaryIsCurrent = generatedSummary?.monthKey === month.key && generatedSummary.assignment === dashboardAssignment;
  const summary = summaryIsCurrent ? generatedSummary.text : preparedSummaryText;
  const summarySource = summaryIsCurrent ? generatedSummary.source : "prepared";

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
    let cancelled = false;
    async function loadClickUp() {
      try {
        const response = await fetch("/api/clickup", { cache: "no-store" });
        const result = (await response.json()) as ClickUpPayload & { error?: string };
        if (!response.ok || !result.workspace || !Array.isArray(result.people) || !Array.isArray(result.parents) || !Array.isArray(result.subtasks)) {
          throw new Error(result.error || "ClickUp өгөгдөл татаж чадсангүй.");
        }
        if (cancelled) return;
        setClickUpData(result);
        const latestMonthKey = result.subtasks.reduce((latest, task) => {
          const key = monthKeyFromDate(task.dueDate);
          return key > latest ? key : latest;
        }, "01");
        setSelectedMonthKey(latestMonthKey);
      } catch (error) {
        if (!cancelled) setClickUpError(error instanceof Error ? error.message : "ClickUp өгөгдөл татаж чадсангүй.");
      } finally {
        if (!cancelled) setClickUpLoading(false);
      }
    }
    void loadClickUp();
    return () => { cancelled = true; };
  }, []);

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
      setGeneratedSummary({
        text: result.summary,
        monthKey: month.key,
        assignment: dashboardAssignment,
        source: result.source ?? "groq",
      });
    } catch {
      setGeneratedSummary({
        text: preparedSummary(month, previous, categories),
        monthKey: month.key,
        assignment: dashboardAssignment,
        source: "local",
      });
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
      <TeamSidebar open={mobileMenu} onClose={() => setMobileMenu(false)} />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Цэс нээх"><Menu size={20} /></button>
            <div className="breadcrumb"><span>CX team</span><ArrowRight size={14} /><strong>Сарын гүйцэтгэл</strong></div>
          </div>
          <div className="topbar-actions">
            <button className="period-select" aria-label="Тайлангийн жил сонгох">
              <CalendarDays size={16} /> 2026 он <ChevronDown size={14} />
            </button>
            <ReportDownload data={clickUpData} filters={{ person: dashboardAssignment, month: activeMonthKey }} context={{ label: `${month.label} · ${dashboardAssignmentName}`, text: summary }} />
          </div>
        </header>

        <div className="content-wrap">
          {clickUpError && <div className="clickup-error" role="alert"><span><X size={18} /></span><div><strong>Өгөгдөл татагдсангүй</strong><p>{clickUpError}</p></div></div>}
          <section className="hero" id="overview">
            <div className="eyebrow"><span /> ГҮЙЦЭТГЭЛИЙН ХЯНАЛТ</div>
            <div className="hero-row">
              <div>
                <h1>Ажлын тайлан<span>.</span></h1>
                <p>ClickUp-ийн complete subtask, Type болон time estimate-ээс автоматаар тооцов.</p>
              </div>
              <div className="dashboard-filter-group">
                <label className="assignment-filter">
                  <span>Assignment</span>
                  <select value={dashboardAssignment} onChange={(event) => setDashboardAssignment(event.target.value)}>
                    <option value="all">Бүх ажилтан</option>
                    {(clickUpData?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <div className="month-switcher" aria-label="Сар сонгох">
                  {displayMonths.map((item) => (
                    <button key={item.key} className={activeMonthKey === item.key ? "selected" : ""} onClick={() => selectMonth(item.key)}>
                      {item.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="kpi-grid" aria-label="Гол үзүүлэлтүүд">
            <article className="kpi-card primary-card">
              <div className="kpi-head"><span>Гүйцэтгэсэн ажил</span><div className="kpi-icon"><CheckCircle2 size={20} /></div></div>
              <div className="kpi-value">{formatNumber(month.tasks)}</div>
              <div className="kpi-foot">
                {previous.tasks > 0 ? <><Delta value={taskDelta} /><span>өмнөх сараас</span></> : <span>ClickUp snapshot data</span>}
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
                <div><span className="panel-kicker">{dashboardAssignmentName.toLocaleUpperCase("mn-MN")} · {displayMonths.length} САР</span><h2>Сарын гүйцэтгэл</h2></div>
                <div className="legend"><span className="legend-dot" />Ажлын тоо</div>
              </div>
              <div className="chart-area" role="img" aria-label={`2026 оны ${displayMonths.length} сарын ClickUp complete subtask график`}>
                <div className="y-labels"><span>{formatNumber(chartMax)}</span><span>{formatNumber(Math.round(chartMax * .75))}</span><span>{formatNumber(Math.round(chartMax * .5))}</span><span>{formatNumber(Math.round(chartMax * .25))}</span><span>0</span></div>
                <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
                <div className="bars">
                  {displayMonths.map((item, index) => (
                    <button key={item.key} className={`bar-group ${activeMonthKey === item.key ? "active" : ""}`} onClick={() => selectMonth(item.key)} aria-label={`${item.label}: ${item.tasks} ажил`}>
                      <span className="bar-value">{formatNumber(item.tasks)}</span>
                      <span className="bar-track"><span className="bar-fill" style={{ height: `${(item.tasks / chartMax) * 100}%`, animationDelay: `${index * 70}ms` }} /></span>
                      <span className="bar-label">{item.short}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-summary"><TrendingUp size={16} /><span>{dashboardAssignmentName} · 2026 оны I–{latestMonth.short}</span><strong>{formatNumber(yearTotals.tasks)} ажил</strong><span>хадгалсан ClickUp data</span></div>
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

          <section className="ai-panel" id="ai-summary">
            <div className="ai-orb"><Sparkles size={25} /><span /></div>
            <div className="ai-content">
              <div className="ai-heading">
                <div><span className="ai-label">GROQ AI · CLICKUP SNAPSHOT</span><h2>{summaryIsCurrent ? month.label : "Сонгосон сар"} — гол дүгнэлт</h2></div>
                <button className="summarize-button" onClick={generateSummary} disabled={isSummarizing}>
                  {isSummarizing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={15} />}
                  {isSummarizing ? "Нэгтгэж байна" : summaryIsCurrent ? "Дахин нэгтгэх" : "Энэ сарыг нэгтгэх"}
                </button>
              </div>
              <div className={`summary-text ${isSummarizing ? "loading" : ""}`}>
                {summary.split(/\n\s*\n/).map((paragraph, index) => <p key={`${month.key}-${dashboardAssignment}-${index}`}>{paragraph}</p>)}
              </div>
              <div className="ai-meta"><span className="online-dot" />{summarySource === "groq" ? "Groq загвараар шинээр боловсруулав" : summarySource === "local" ? "Бэлтгэсэн нэгтгэл ашиглав" : "Өгөгдөлд суурилсан бэлтгэсэн дүгнэлт"}<span className="meta-separator" />Тоон үзүүлэлтийг автоматаар шалгасан</div>
            </div>
          </section>

          <section className="comparison-section" id="comparison">
            <div className="section-title"><div><span className="panel-kicker">CLICKUP SNAPSHOT ХАРЬЦУУЛАЛТ</span><h2>2026 оны хагас жилийн хөдөлгөөн</h2></div><p>Due date-аар I–VI сар болон VII–{latestMonth.short} сарын complete subtask-ийг харьцуулав.</p></div>
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
              <MemberParticipationPie members={selectedCategory.members} monthLabel={month.label} />
            </div>
            <div className="drawer-callout"><Sparkles size={17} /><span>ClickUp sync шинэчлэгдэхэд энэ Type-ийн үзүүлэлт автоматаар дахин тооцогдоно.</span></div>
          </>
        )}
      </aside>
    </div>
  );
}
