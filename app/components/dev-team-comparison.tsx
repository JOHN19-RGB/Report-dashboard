"use client";

import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buildTeamComparison, comparisonSummary } from "../lib/team-comparison";
import type { DevReportData } from "../lib/dev-report";
import type { ReportData } from "../lib/report";
import { clickUpReportLoader } from "../lib/clickup-report-loader";

export default function DevTeamComparison({ data }: { data: DevReportData | null }) {
  const [month, setMonth] = useState("05");
  const [cx, setCx] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<{ key: string; text: string } | null>(null);
  const requestRef = useRef(0);
  const year = cx?.reportYear || 2026;
  const key = `${year}-${month}`;
  const facts = useMemo(() => cx && data ? buildTeamComparison(cx, data, key) : null, [cx, data, key]);
  const previousFacts = useMemo(() => {
    if (!cx || !data || month === "01") return null;
    const previousMonth = String(Number(month) - 1).padStart(2, "0");
    return buildTeamComparison(cx, data, `${year}-${previousMonth}`);
  }, [cx, data, month, year]);
  const factsKey = facts ? JSON.stringify(facts) : "";
  const summary = generated?.key === factsKey ? generated.text : facts ? comparisonSummary(facts) : "";
  const insight = summary.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)[2] || "";
  const monthChanges = facts && previousFacts ? [
    { key: "cx-bug", label: "CX · Bug", current: facts.cx.bug, previous: previousFacts.cx.bug },
    { key: "cx-imp", label: "CX · IMP", current: facts.cx.imp, previous: previousFacts.cx.imp },
    { key: "dev-bug", label: "Dev · Bug", current: facts.dev.bug, previous: previousFacts.dev.bug },
    { key: "dev-imp", label: "Dev · IMP", current: facts.dev.imp, previous: previousFacts.dev.imp },
  ].map(item => ({
    ...item,
    change: item.previous === 0 ? (item.current ? null : 0) : ((item.current - item.previous) / item.previous) * 100,
  })) : [];
  const maxChange = Math.max(1, ...monthChanges.map(item => Math.abs(item.change ?? 100)));

  async function generate() {
    if (!data || loading) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const currentCx = await clickUpReportLoader.load<ReportData>("/api/clickup", {
        refreshPath: "/api/clickup?refresh=1",
        validate: (value): value is ReportData => {
          const result = value as ReportData | null;
          return Boolean(result && typeof result.syncedAt === "string" && Array.isArray(result.subtasks) && Number.isInteger(result.reportYear));
        },
        onData: setCx,
      });
      const currentFacts = buildTeamComparison(currentCx, data, `${currentCx.reportYear}-${month}`);
      const currentKey = JSON.stringify(currentFacts);
      // Local verified summary is already available, even if AI is offline.
      setGenerated({ key: currentKey, text: comparisonSummary(currentFacts) });
      try {
        const response = await fetch("/api/summarize/comparison", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25_000), body: JSON.stringify(currentFacts) });
        const result = await response.json() as { summary?: string };
        if (requestRef.current === requestId && response.ok && result.summary) setGenerated({ key: currentKey, text: result.summary });
      } catch { /* Keep the verified local summary. */ }
    } catch (loadError) {
      if (requestRef.current === requestId) setError(loadError instanceof Error ? loadError.message : "Дүгнэлт үүссэнгүй.");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }

  return <section className="ai-panel dev-comparison-summary">
    <div className="ai-orb" aria-hidden="true"><Sparkles size={23} /><span /></div>
    <div className="ai-content">
      <div className="ai-heading"><div><div className="ai-label">GROQ AI · CLICKUP SNAPSHOT</div><h2>Сонгосон сар — гол дүгнэлт</h2><p className="dev-summary-subtitle">CX & Dev · Bug / IMP дүгнэлт</p></div><div className="dev-summary-controls"><label>Тайлант сар<select aria-label="CX Dev дүгнэлтийн сар" value={month} disabled={loading} onChange={event => setMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{year} · {index + 1}-р сар</option>)}</select></label><button className="summarize-button" type="button" disabled={loading || !data} onClick={() => void generate()}>{loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}{loading ? "Нэгтгэж байна" : "Дүгнэлт гаргах"}</button></div></div>
      <div className="dev-summary-content">
      {error && <p className="dev-summary-error" role="alert">{error}</p>}
      {!summary && <div className="dev-summary-empty"><Sparkles size={18} /><div><strong>Сарын дүгнэлт бэлэн болоогүй байна</strong><span>Сараа сонгоод ClickUp өгөгдлийг нэгтгэнэ үү.</span></div></div>}
      {facts && <>
        <div className="dev-summary-overview">
          <div className="dev-summary-insight" aria-live="polite">
            <span><Sparkles size={14} /> AI НЭГТГЭЛ</span>
            <p>{insight}</p>
          </div>
          <div className="dev-summary-stats" aria-label="CX Dev баталгаажуулсан тоонууд">
            <article><span>CX</span><strong>{facts.cx.bug + facts.cx.imp}</strong><small><b data-summary="cx-bug">{facts.cx.bug}</b> Bug · <b data-summary="cx-imp">{facts.cx.imp}</b> IMP</small></article>
            <article><span>Dev · 5 ажилтан</span><strong>{facts.dev.bug + facts.dev.imp}</strong><small><b data-summary="dev-bug">{facts.dev.bug}</b> Bug · <b data-summary="dev-imp">{facts.dev.imp}</b> IMP</small></article>
            <article className="difference"><span>CX − Dev зөрүү</span><strong>{facts.difference.bug + facts.difference.imp > 0 ? "+" : ""}{facts.difference.bug + facts.difference.imp}</strong><small>Bug {facts.difference.bug > 0 ? "+" : ""}{facts.difference.bug} · IMP {facts.difference.imp > 0 ? "+" : ""}{facts.difference.imp}</small></article>
          </div>
        </div>
        {previousFacts ? <div className="dev-mom-chart" aria-label="Өмнөх сартай харьцуулсан өөрчлөлт"><div className="dev-mom-heading"><strong>Өмнөх сартай харьцуулалт</strong><span>{previousFacts.period.replace(" дүгнэлт", "")}</span></div>{monthChanges.map(item => { const change = item.change; const direction = change === null || change > 0 ? "positive" : change < 0 ? "negative" : "neutral"; const Icon = direction === "positive" ? ArrowUpRight : direction === "negative" ? ArrowDownRight : Minus; const width = `${Math.max(4, Math.min(100, Math.abs(change ?? 100) / maxChange * 100))}%`; return <div className="dev-mom-row" key={item.key}><span className="dev-mom-label">{item.label}</span><div className="dev-mom-track"><i className={direction} style={{ width }} /></div><span className={`dev-mom-delta ${direction}`}><Icon size={14} />{change === null ? "Шинэ" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</span><small>{item.previous} → {item.current}</small></div>; })}</div> : <p className="dev-mom-empty"><Minus size={14} /> Өмнөх сарын харьцуулах өгөгдөл 1-р сард байхгүй.</p>}
        <div className="ai-meta"><span className="online-dot" />ClickUp өгөгдлөөр баталгаажуулсан{facts.partial && <><span className="meta-separator" />Эх өгөгдөл дутуу</>}</div>
      </>}
      </div>
    </div>
  </section>;
}
