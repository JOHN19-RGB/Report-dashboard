"use client";

import { ArrowDownRight, ArrowUpRight, Bot, Bug, CircleDot, Clock3, Layers3, ListTree, Minus, RefreshCw, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { summaryDuration, type DevFilterSummary, type DevFilterSummaryInput, type DevNamedCount, type DevTaskTypeSummaryInput } from "../lib/dev-filter-summary";

function resultIsValid(value: unknown): value is DevFilterSummary {
  const result = value as DevFilterSummary | null;
  return Boolean(result && typeof result.introduction === "string" && typeof result.impText === "string" && typeof result.bugText === "string" && result.facts?.imp && result.facts?.bug && Array.isArray(result.facts.breakdown?.types) && Array.isArray(result.facts.breakdown?.statuses));
}

function summarySentences(text: string) {
  return text.trim().split(/\.\s+/).map(sentence => sentence.trim()).filter(Boolean).map(sentence => sentence.endsWith(".") ? sentence : `${sentence}.`);
}

function BreakdownGroup({ title, subtitle, items, kind }: { title: string; subtitle: string; items: DevNamedCount[]; kind: "type" | "status" }) {
  const Icon = kind === "type" ? ListTree : CircleDot;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <section className={`dev-filter-breakdown-group ${kind}`}>
    <header><span><Icon size={16} /></span><div><h3>{title}</h3><p>{subtitle}</p></div><b>{total}</b></header>
    {items.length ? <ul>{items.map(item => <li key={`${kind}-${item.name}`}><i /><span>{item.name}</span><b>{item.count}</b></li>)}</ul> : <p className="dev-filter-breakdown-empty">Шүүлтүүрт тохирох өгөгдөл алга.</p>}
  </section>;
}

function comparisonBadge(facts: DevTaskTypeSummaryInput & { changePercent: number | null }) {
  if (facts.previousCount === null) return { label: "Харьцуулах өгөгдөлгүй", direction: "neutral", Icon: Minus } as const;
  if (facts.previousCount === 0 && facts.count > 0) return { label: "Шинэ", direction: "positive", Icon: ArrowUpRight } as const;
  const change = facts.changePercent || 0;
  if (Math.abs(change) < 0.05) return { label: "0.0%", direction: "neutral", Icon: Minus } as const;
  return {
    label: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
    direction: change > 0 ? "positive" : "negative",
    Icon: change > 0 ? ArrowUpRight : ArrowDownRight,
  } as const;
}

export default function DevFilterSummary({ input, syncedAt }: { input: DevFilterSummaryInput; syncedAt?: string }) {
  const inputKey = useMemo(() => JSON.stringify(input), [input]);
  const [generated, setGenerated] = useState<{ key: string; summary: DevFilterSummary; source: "groq" | "local" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const current = generated?.key === inputKey ? generated : null;
  const chips = [input.period, input.filter.taskType, input.filter.sprint, input.filter.search ? `Хайлт · ${input.filter.search}` : ""].filter(Boolean);

  useEffect(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError("");
    return () => abortRef.current?.abort();
  }, [inputKey]);

  async function generate() {
    if (loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    const requestKey = inputKey;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/summarize/dev", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(input) });
      const result = await response.json() as { summary?: unknown; source?: "groq" | "local"; error?: string };
      if (!response.ok || !resultIsValid(result.summary)) throw new Error(result.error || "AI дүгнэлт үүссэнгүй.");
      if (requestRef.current === requestId && requestKey === inputKey) setGenerated({ key: requestKey, summary: result.summary, source: result.source === "groq" ? "groq" : "local" });
    } catch (loadError) {
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "AI дүгнэлт үүссэнгүй.");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }

  const syncLabel = syncedAt && !Number.isNaN(new Date(syncedAt).getTime())
    ? new Intl.DateTimeFormat("mn-MN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(syncedAt))
    : "—";

  const impBadge = current ? comparisonBadge(current.summary.facts.imp) : null;
  const bugBadge = current ? comparisonBadge(current.summary.facts.bug) : null;

  return <section className="ai-panel dev-filter-summary" aria-labelledby="dev-filter-summary-title">
    <div className="ai-orb dev-filter-summary-orb" aria-hidden="true"><Bot size={23} /><span /></div>
    <div className="ai-content">
      <div className="ai-heading dev-filter-summary-heading">
        <div><div className="ai-label">GROQ AI · CURRENT FILTERS</div><h2 id="dev-filter-summary-title">Таск гүйцэтгэлийн харьцуулалт</h2><p className="dev-filter-summary-subtitle">Imp / Bug · Priority · Time estimate · өмнөх sprint</p></div>
        <button className="summarize-button dev-filter-summary-action" type="button" disabled={loading} onClick={() => void generate()}>{loading ? <RefreshCw className="spin" size={15} /> : <Sparkles size={15} />}{loading ? "Нэгтгэж байна" : current ? "Дахин нэгтгэх" : "Дүгнэлт гаргах"}</button>
      </div>
      <div className="dev-filter-summary-chips" aria-label="AI дүгнэлтэд ашигласан шүүлтүүр"><SlidersHorizontal size={14} />{chips.map(chip => <span key={chip}>{chip}</span>)}</div>
      {error && <p className="dev-filter-summary-error" role="alert">{error}</p>}
      {!current ? <div className="dev-filter-summary-empty"><span><Sparkles size={20} /></span><div><strong>{input.imp.count} Imp · {input.bug.count} Bug таскийг нэгтгэхэд бэлэн</strong><p>Одоогийн шүүлтүүрээр priority, time estimate болон өмнөх sprint-ийн өөрчлөлтийг нэгтгэнэ.</p></div><div className="dev-filter-summary-ready-stats" aria-hidden="true"><span><b>{input.imp.count}</b>Imp</span><i /><span><b>{input.bug.count}</b>Bug</span></div></div> : <div className="dev-filter-summary-body">
        <div className="dev-filter-summary-lead" aria-live="polite"><span><Sparkles size={14} /> AI НЭГТГЭЛ</span><p>{current.summary.introduction}</p><small>Шүүлтүүртэй ClickUp өгөгдлөөс баталгаажуулсан тоонууд</small></div>
        <div className="dev-filter-breakdown" aria-label="Шүүсэн таскуудын төрөл болон ClickUp төлөв">
          <BreakdownGroup title="Task type" subtitle="ClickUp-ийн бодит төрөл" items={current.summary.facts.breakdown.types} kind="type" />
          <BreakdownGroup title="ClickUp status" subtitle="ClickUp-ийн бодит төлөв" items={current.summary.facts.breakdown.statuses} kind="status" />
        </div>
        <div className="dev-filter-template">
          <article className="imp">
            <header><div className="dev-filter-template-title"><span><TrendingUp size={18} /></span><div><small>IMPROVEMENT</small><h3>Imp task</h3></div></div>{impBadge && <b className={`dev-filter-change ${impBadge.direction}`}><impBadge.Icon size={15} />{impBadge.label}</b>}</header>
            <div className="dev-filter-template-metrics"><div><span><Layers3 size={14} />Нийт таск</span><strong>{current.summary.facts.imp.count}</strong></div><div><span><Clock3 size={14} />Time estimate</span><strong>{summaryDuration(current.summary.facts.imp.estimateMinutes)}</strong></div><div><span>Өмнөх sprint</span><strong>{current.summary.facts.imp.previousCount ?? "—"}</strong></div></div>
            <div className="dev-filter-narrative"><span>ТАЙЛБАР</span><ol>{summarySentences(current.summary.impText).map((sentence, index) => <li key={`imp-${index}`}><i>{index + 1}</i><p>{sentence}</p></li>)}</ol></div>
          </article>
          <article className="bug">
            <header><div className="dev-filter-template-title"><span><Bug size={18} /></span><div><small>BUG REPORT</small><h3>Bug task</h3></div></div>{bugBadge && <b className={`dev-filter-change ${bugBadge.direction}`}><bugBadge.Icon size={15} />{bugBadge.label}</b>}</header>
            <div className="dev-filter-template-metrics"><div><span><Layers3 size={14} />Нийт таск</span><strong>{current.summary.facts.bug.count}</strong></div><div><span><Clock3 size={14} />Time estimate</span><strong>{summaryDuration(current.summary.facts.bug.estimateMinutes)}</strong></div><div><span>Өмнөх sprint</span><strong>{current.summary.facts.bug.previousCount ?? "—"}</strong></div></div>
            <div className="dev-filter-narrative"><span>ТАЙЛБАР</span><ol>{summarySentences(current.summary.bugText).map((sentence, index) => <li key={`bug-${index}`}><i>{index + 1}</i><p>{sentence}</p></li>)}</ol></div>
          </article>
        </div>
        <div className="ai-meta dev-filter-summary-meta"><span className="online-dot" />{current.source === "groq" ? "Groq AI найруулга" : "Баталгаажсан бэлтгэсэн найруулга"}<span className="meta-separator" />Тоонуудыг сервер дахин тооцсон<span className="meta-separator" />ClickUp sync {syncLabel}{input.partial && <><span className="meta-separator" />Эх өгөгдөл дутуу</>}</div>
      </div>}
    </div>
  </section>;
}
