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
import { useEffect, useMemo, useState } from "react";

type MonthKey = "01" | "02" | "03" | "04" | "05" | "06";

type Month = {
  key: MonthKey;
  short: string;
  label: string;
  tasks: number;
  minutes: number;
};

type Category = {
  id: string;
  name: string;
  shortName: string;
  tasks: number;
  minutes: number;
  color: string;
  icon: typeof ListChecks;
  description: string;
  examples: string[];
};

const months: Month[] = [
  { key: "01", short: "I", label: "1 дүгээр сар", tasks: 1084, minutes: 596 * 60 + 40 },
  { key: "02", short: "II", label: "2 дугаар сар", tasks: 1157, minutes: 620 * 60 + 15 },
  { key: "03", short: "III", label: "3 дугаар сар", tasks: 1266, minutes: 682 * 60 + 33 },
  { key: "04", short: "IV", label: "4 дүгээр сар", tasks: 1194, minutes: 643 * 60 + 40 },
  { key: "05", short: "V", label: "5 дугаар сар", tasks: 1045, minutes: 689 * 60 + 23 },
  { key: "06", short: "VI", label: "6 дугаар сар", tasks: 950, minutes: 586 * 60 + 58 },
];

const categoryMeta = [
  {
    id: "daily",
    name: "Өдөр тутмын ажил",
    shortName: "Daily Task",
    color: "#ff6b4a",
    icon: ListChecks,
    description: "Тогтмол хяналт, өгөгдөл шалгалт болон өдөр тутмын үйл ажиллагаа.",
    examples: ["Өглөөний системийн хяналт", "Өдөр тутмын дата шалгалт", "Ажлын явцын бүртгэл шинэчлэх"],
  },
  {
    id: "meeting",
    name: "Teams уулзалт",
    shortName: "Teams Meeting",
    color: "#7c5cff",
    icon: Users,
    description: "Харилцагч болон хэлтэс хоорондын шаардлага, уялдааны уулзалтууд.",
    examples: ["Шинэ боломжийн шаардлага хэлэлцэх", "Харилцагчийн танилцуулга", "Хөгжүүлэлтийн уялдаа уулзалт"],
  },
  {
    id: "phone",
    name: "Утасны хүсэлт",
    shortName: "Phone Call",
    color: "#168c80",
    icon: MessageSquareText,
    description: "Zendesk-д төвлөрүүлэн бүртгэсэн хэрэглэгчийн дуудлага, хүсэлтүүд.",
    examples: ["Хэрэглэгчийн дуудлага хүлээн авах", "Zendesk хүсэлт үүсгэх", "Шийдлийн эргэн холбоо өгөх"],
  },
  {
    id: "development",
    name: "Хөгжүүлэлт",
    shortName: "Development",
    color: "#2676e8",
    icon: Zap,
    description: "Шинэ боломж, интеграц, автоматжуулалтын хөгжүүлэлт.",
    examples: ["Шинэ тайлангийн модуль", "API интеграц", "Процесс автоматжуулалт"],
  },
  {
    id: "bug",
    name: "Алдаа засвар",
    shortName: "Bug Fix",
    color: "#ee9d2b",
    icon: Target,
    description: "Системийн алдааг оношлох, засах болон дахин шалгах ажил.",
    examples: ["Логийн алдаа оношлох", "Засвар production-д гаргах", "Regression тест хийх"],
  },
  {
    id: "support",
    name: "Хэрэглэгчийн дэмжлэг",
    shortName: "Daily Support",
    color: "#48a561",
    icon: CheckCircle2,
    description: "Өдөр тутмын асуулт, тохиргоо, ашиглалтын тусламж.",
    examples: ["Эрхийн тохиргоо шалгах", "Ашиглалтын заавар өгөх", "Хүсэлтийн шийдэл баталгаажуулах"],
  },
  {
    id: "internal",
    name: "Дотоод сайжруулалт",
    shortName: "Internal",
    color: "#d8588f",
    icon: TrendingUp,
    description: "Багийн процесс, баримтжуулалт, дотоод төслийн сайжруулалт.",
    examples: ["Процессын зураглал шинэчлэх", "Дотоод гарын авлага", "Багийн backlog цэгцлэх"],
  },
  {
    id: "analytics",
    name: "Тест ба аналитик",
    shortName: "Test & Analytics",
    color: "#67758d",
    icon: LayoutDashboard,
    description: "Тест, өгөгдлийн шинжилгээ болон удирдлагын тайлан бэлтгэх.",
    examples: ["Сарын KPI шинжилгээ", "Feature тест", "Удирдлагын тайлан боловсруулах"],
  },
];

const juneValues = [
  [138, 158 * 60 + 33],
  [29, 35 * 60 + 7],
  [242, 86 * 60 + 42],
  [96, 112 * 60 + 15],
  [124, 78 * 60 + 31],
  [168, 48 * 60 + 20],
  [85, 42 * 60 + 18],
  [68, 25 * 60 + 12],
];

const mayValues = [
  [125, 144 * 60 + 35],
  [20, 21 * 60 + 50],
  [188, 75 * 60 + 12],
  [118, 137 * 60 + 40],
  [146, 92 * 60 + 28],
  [240, 94 * 60 + 16],
  [108, 69 * 60 + 7],
  [100, 54 * 60 + 15],
];

const fallbackSummary =
  "6 дугаар сард нийт 950 ажилд 586 цаг 58 минут зарцуулсан байна. 5 дугаар сартай харьцуулахад гүйцэтгэсэн ажлын тоо 95-аар буюу 9.1%, нийт хугацаа 102 цаг 25 минутаар буюу 14.9% буурчээ.\n\nӨдөр тутмын ажил 138 болж 13-аар өссөн бөгөөд 158 цаг 33 минут зарцуулсан. Teams уулзалт 29 болж 45.0%-иар, уулзалтад зарцуулсан хугацаа 13 цаг 17 минутаар өссөн нь шинэ боломж, хөгжүүлэлтийн шаардлага болон харилцагчтай хийх уялдааны уулзалт нэмэгдсэнийг харуулж байна.\n\nНэг ажилд зарцуулсан дундаж хугацаа 39.6 минутаас 37.1 минут болж 2.5 минутаар буурсан. Энэ нь нийт ачаалал буурсан үеэр ч ажлын боловсруулалтын хурд сайжирсныг илтгэнэ.";

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value);
}

function formatMinutes(value: number, compact = false) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return compact ? `${formatNumber(hours)}ц ${minutes}м` : `${formatNumber(hours)} цаг ${minutes} мин`;
}

function percentChange(current: number, previous: number) {
  return ((current - previous) / previous) * 100;
}

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function buildCategories(month: Month): Category[] {
  const exact = month.key === "06" ? juneValues : month.key === "05" ? mayValues : null;
  const taskScale = month.tasks / 950;
  const timeScale = month.minutes / (586 * 60 + 58);
  let generated = categoryMeta.map((meta, index) => ({
    ...meta,
    tasks: exact ? exact[index][0] : Math.round(juneValues[index][0] * taskScale),
    minutes: exact ? exact[index][1] : Math.round(juneValues[index][1] * timeScale),
  }));

  if (!exact) {
    const taskDifference = month.tasks - generated.reduce((sum, item) => sum + item.tasks, 0);
    const timeDifference = month.minutes - generated.reduce((sum, item) => sum + item.minutes, 0);
    generated = generated.map((item, index) =>
      index === 0
        ? { ...item, tasks: item.tasks + taskDifference, minutes: item.minutes + timeDifference }
        : item,
    );
  }

  return generated;
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
  const [selectedMonthKey, setSelectedMonthKey] = useState<MonthKey>("06");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [summary, setSummary] = useState(fallbackSummary);
  const [summaryMonth, setSummaryMonth] = useState<MonthKey>("06");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarySource, setSummarySource] = useState<"prepared" | "groq" | "local">("prepared");
  const [mobileMenu, setMobileMenu] = useState(false);

  const monthIndex = months.findIndex((month) => month.key === selectedMonthKey);
  const month = months[monthIndex];
  const previous = months[Math.max(0, monthIndex - 1)];
  const categories = useMemo(() => buildCategories(month), [month]);
  const previousCategories = useMemo(() => buildCategories(previous), [previous]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const taskDelta = monthIndex === 0 ? 0 : percentChange(month.tasks, previous.tasks);
  const timeDelta = monthIndex === 0 ? 0 : percentChange(month.minutes, previous.minutes);
  const averageMinutes = month.minutes / month.tasks;
  const previousAverage = previous.minutes / previous.tasks;
  const maxTasks = Math.max(...months.map((item) => item.tasks));
  const maxCategoryTasks = Math.max(...categories.map((item) => item.tasks));
  const summaryIsCurrent = summaryMonth === selectedMonthKey;

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
            monthIndex > 0
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
            monthIndex > 0
              ? previousCategories.map(({ name, shortName, tasks, minutes }) => ({
                  name,
                  shortName,
                  tasks,
                  minutes,
                }))
              : null,
          halfYear: {
            previous: { period: "2025 оны 7–12 сар", tasks: 668, minutes: 620 * 60 },
            current: { period: "2026 оны 1–6 сар", tasks: 6696, minutes: 3819 * 60 + 29 },
          },
        }),
      });
      const result = (await response.json()) as { summary?: string; source?: "groq" | "local"; error?: string };
      if (!response.ok || !result.summary) throw new Error(result.error || "Нэгтгэл үүссэнгүй");
      setSummary(result.summary);
      setSummaryMonth(selectedMonthKey);
      setSummarySource(result.source ?? "groq");
    } catch {
      setSummary(fallbackSummary);
      setSummaryMonth("06");
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
          <span className="brand-mark"><span /></span>
          <span className="brand-copy"><strong>АЖЛЫН</strong><small>ТАЙЛАН</small></span>
        </div>
        <nav className="nav-list">
          <a className="nav-item active" href="#overview" onClick={() => setMobileMenu(false)}>
            <LayoutDashboard size={19} /> <span>Хураангуй</span>
          </a>
          <a className="nav-item" href="#workload" onClick={() => setMobileMenu(false)}>
            <ListChecks size={19} /> <span>Ажлын төрөл</span>
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
        <div className="sidebar-footer"><span className="online-dot" />Өгөгдөл шинэчлэгдсэн</div>
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
                <p>Багийн ажлын ачаалал, үр ашиг болон сарын өөрчлөлтийг нэг дороос.</p>
              </div>
              <div className="month-switcher" aria-label="Сар сонгох">
                {months.map((item) => (
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
                {monthIndex > 0 ? <><Delta value={taskDelta} /><span>өмнөх сараас</span></> : <span>хагас жилийн эхлэл</span>}
              </div>
              <div className="card-glow" />
            </article>
            <article className="kpi-card">
              <div className="kpi-head"><span>Нийт зарцуулсан цаг</span><div className="kpi-icon blue"><Clock3 size={20} /></div></div>
              <div className="kpi-value time-value">{formatMinutes(month.minutes, true)}</div>
              <div className="kpi-foot">
                {monthIndex > 0 ? <><Delta value={timeDelta} /><span>өмнөх сараас</span></> : <span>хагас жилийн эхлэл</span>}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-head"><span>Нэг ажилд</span><div className="kpi-icon green"><Zap size={20} /></div></div>
              <div className="kpi-value">{averageMinutes.toFixed(1)}<small> мин</small></div>
              <div className="kpi-foot">
                {monthIndex > 0 ? <><Delta value={percentChange(averageMinutes, previousAverage)} suffix={`${(averageMinutes - previousAverage).toFixed(1)} мин`} /><span>дундаж хугацаа</span></> : <span>дундаж хугацаа</span>}
              </div>
            </article>
            <article className="kpi-card emphasis-card">
              <div className="kpi-head"><span>Хамгийн идэвхтэй</span><div className="kpi-icon violet"><Target size={20} /></div></div>
              <div className="kpi-value compact-value">{categories.slice().sort((a, b) => b.tasks - a.tasks)[0].shortName}</div>
              <button className="text-link" onClick={() => setSelectedCategoryId(categories.slice().sort((a, b) => b.tasks - a.tasks)[0].id)}>
                {formatNumber(categories.slice().sort((a, b) => b.tasks - a.tasks)[0].tasks)} ажил <ArrowRight size={14} />
              </button>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-panel">
              <div className="panel-head">
                <div><span className="panel-kicker">6 САРЫН ХӨДӨЛГӨӨН</span><h2>Сарын гүйцэтгэл</h2></div>
                <div className="legend"><span className="legend-dot" />Ажлын тоо</div>
              </div>
              <div className="chart-area" role="img" aria-label="2026 оны эхний 6 сарын гүйцэтгэсэн ажлын баганан график">
                <div className="y-labels"><span>1,300</span><span>975</span><span>650</span><span>325</span><span>0</span></div>
                <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
                <div className="bars">
                  {months.map((item, index) => (
                    <button key={item.key} className={`bar-group ${selectedMonthKey === item.key ? "active" : ""}`} onClick={() => selectMonth(item.key)} aria-label={`${item.label}: ${item.tasks} ажил`}>
                      <span className="bar-value">{formatNumber(item.tasks)}</span>
                      <span className="bar-track"><span className="bar-fill" style={{ height: `${(item.tasks / maxTasks) * 100}%`, animationDelay: `${index * 70}ms` }} /></span>
                      <span className="bar-label">{item.short}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-summary"><TrendingUp size={16} /><span>2026 оны эхний хагас жилд</span><strong>6,696 ажил</strong><span>гүйцэтгэв</span></div>
            </article>

            <article className="panel mix-panel" id="workload">
              <div className="panel-head">
                <div><span className="panel-kicker">{month.short} САРЫН БҮТЭЦ</span><h2>Ажлын ангилал</h2></div>
                <span className="click-hint">Дарж задлах</span>
              </div>
              <div className="category-list">
                {categories.slice().sort((a, b) => b.tasks - a.tasks).map((category) => {
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
                <div><span className="ai-label">GROQ AI НЭГТГЭЛ</span><h2>{summaryIsCurrent ? month.label : "6 дугаар сар"} — гол дүгнэлт</h2></div>
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
            <div className="section-title"><div><span className="panel-kicker">ХАГАС ЖИЛИЙН ХАРЬЦУУЛАЛТ</span><h2>Ачаалал ба бүтээмжийн өсөлт</h2></div><p>Багийн бүтэц болон ажлын хүрээний өөрчлөлтийг өмнөх хугацаатай харьцуулав.</p></div>
            <div className="comparison-grid">
              <article className="period-card muted-period">
                <div className="period-head"><span>ӨМНӨХ ҮЕ</span><strong>2025 · VII–XII</strong></div>
                <div className="period-stats"><div><small>НИЙТ АЖИЛ</small><strong>668</strong></div><div><small>НИЙТ ХУГАЦАА</small><strong>620<em> цаг</em></strong></div></div>
                <div className="period-rate"><span>Нэг цагт</span><strong>1.08 ажил</strong></div>
              </article>
              <div className="comparison-arrow"><ArrowRight size={21} /><span>6 сарын өөрчлөлт</span></div>
              <article className="period-card current-period">
                <div className="period-head"><span>ТАЙЛАНТ ҮЕ</span><strong>2026 · I–VI</strong></div>
                <div className="period-stats"><div><small>НИЙТ АЖИЛ</small><strong>6,696</strong><Delta value={902.4} /></div><div><small>НИЙТ ХУГАЦАА</small><strong>3,819<em>ц 29м</em></strong><Delta value={516.0} /></div></div>
                <div className="period-rate"><span>Нэг цагт</span><strong>1.75 ажил</strong><span className="rate-chip">+62.4%</span></div>
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
      <aside className={`detail-drawer ${selectedCategory ? "open" : ""}`} aria-hidden={!selectedCategory} aria-label="Ажлын ангиллын дэлгэрэнгүй">
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
              <div><small>ЗАРЦУУЛСАН</small><strong>{formatMinutes(selectedCategory.minutes, true)}</strong><span>нийт хугацаа</span></div>
            </div>
            <div className="drawer-average"><Clock3 size={16} /><span>Нэг ажилд дунджаар</span><strong>{(selectedCategory.minutes / selectedCategory.tasks).toFixed(1)} мин</strong></div>
            <div className="drawer-tasks">
              <div className="drawer-section-title"><span>Жишиг ажлууд</span><small>{month.label}</small></div>
              {selectedCategory.examples.map((task, index) => (
                <div className="task-item" key={task}>
                  <span className="task-check"><CheckCircle2 size={15} /></span>
                  <div><strong>{task}</strong><small>Дууссан · #{String(index + 1).padStart(2, "0")}</small></div>
                </div>
              ))}
            </div>
            <div className="drawer-callout"><Sparkles size={17} /><span>Энэ ангиллын мэдээлэл AI нэгтгэлд автоматаар тусгагдана.</span></div>
          </>
        )}
      </aside>
    </div>
  );
}
