"use client";

import { Copy, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buildTeamComparison, comparisonSummary } from "../lib/team-comparison";
import type { DevReportData } from "../lib/dev-report";
import type { ReportData } from "../lib/report";

export default function DevTeamComparison({ data }: { data: DevReportData | null }) {
  const [month, setMonth] = useState("05");
  const [cx, setCx] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<{ key: string; text: string; source: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef(0);
  const year = cx?.reportYear || 2026;
  const key = `${year}-${month}`;
  const facts = useMemo(() => cx && data ? buildTeamComparison(cx, data, key) : null, [cx, data, key]);
  const factsKey = facts ? JSON.stringify(facts) : "";
  const summary = generated?.key === factsKey ? generated.text : facts ? comparisonSummary(facts) : "";
  const source = generated?.key === factsKey ? generated.source : "local";

  async function generate() {
    if (!data || loading) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const cxResponse = await fetch("/api/clickup", { cache: "no-store" });
      const currentCx = await cxResponse.json() as ReportData & { error?: string };
      if (!cxResponse.ok || !Array.isArray(currentCx.subtasks) || !Number.isInteger(currentCx.reportYear)) throw new Error(currentCx.error || "CX өгөгдөл татагдсангүй.");
      setCx(currentCx);
      const currentFacts = buildTeamComparison(currentCx, data, `${currentCx.reportYear}-${month}`);
      const currentKey = JSON.stringify(currentFacts);
      // Local verified summary is already available, even if AI is offline.
      setGenerated({ key: currentKey, text: comparisonSummary(currentFacts), source: "local" });
      try {
        const response = await fetch("/api/summarize/comparison", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25_000), body: JSON.stringify(currentFacts) });
        const result = await response.json() as { summary?: string; source?: string };
        if (requestRef.current === requestId && response.ok && result.summary) setGenerated({ key: currentKey, text: result.summary, source: result.source || "local" });
      } catch { /* Keep the verified local summary. */ }
    } catch (loadError) {
      if (requestRef.current === requestId) setError(loadError instanceof Error ? loadError.message : "Дүгнэлт үүссэнгүй.");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }

  async function copySummary() {
    try { await navigator.clipboard.writeText(summary); setCopied(true); } catch { setError("Хуулах боломжгүй байна. Текстийг сонгоод хуулна уу."); }
  }

  return <section className="dev-panel dev-comparison-summary">
    <header><div><h2>CX & Dev · Bug / IMP дүгнэлт</h2><p>Бүх багийн сарын дүн · дээд талын sprint, хайлт, төрөл шүүлтүүрээс тусдаа</p></div><div className="dev-summary-controls"><label>Тайлант сар<select aria-label="CX Dev дүгнэлтийн сар" value={month} disabled={loading} onChange={event => { setMonth(event.target.value); setCopied(false); }}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, "0")}>{year} · {index + 1}-р сар</option>)}</select></label><button className="summarize-button" type="button" disabled={loading || !data} onClick={() => void generate()}>{loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}{loading ? "Нэгтгэж байна" : "Дүгнэлт гаргах"}</button></div></header>
    <div className="dev-summary-content">
      {error && <p className="dev-summary-error" role="alert">{error}</p>}
      {!summary && <p className="dev-summary-empty">Сар сонгоод дүгнэлт гаргана уу. CX-ийн Functional болон Performance IMP-ийг нэгтгэн, Dev-ийн сонгосон 5 ажилтны гүйцэтгэсэн ажлуудтай ижил UTC Due date сараар харьцуулна.</p>}
      {facts && <><div className="dev-comparison-facts" aria-label="CX Dev баталгаажуулсан тоонууд"><div><span>Гүйцэтгэсэн таск</span><b>Bug</b><b>IMP</b></div><div><strong>CX</strong><b data-summary="cx-bug">{facts.cx.bug}</b><b data-summary="cx-imp">{facts.cx.imp}</b></div><div><strong>Dev · 5 ажилтан</strong><b data-summary="dev-bug">{facts.dev.bug}</b><b data-summary="dev-imp">{facts.dev.imp}</b></div><div><span>Зөрүү · CX − Dev</span><b>{facts.difference.bug > 0 ? "+" : ""}{facts.difference.bug}</b><b>{facts.difference.imp > 0 ? "+" : ""}{facts.difference.imp}</b></div></div><p className="dev-summary-source">{source === "groq" ? "Groq оршлын найруулга" : "Өгөгдөлд суурилсан нэгтгэл"} · Тоон дүн болон тайлбарыг систем тооцсон · ClickUp-ийн одоогийн status{facts.partial ? " · Эх өгөгдөл дутуу" : ""}</p><div className="dev-summary-text" aria-live="polite">{summary}</div><div className="dev-summary-footer"><span>CX: {new Date(facts.cxSyncedAt).toLocaleString("mn-MN")} · Dev: {new Date(facts.devSyncedAt).toLocaleString("mn-MN")}</span><button type="button" onClick={() => void copySummary()}><Copy size={14} />{copied ? "Хуулсан" : "Дүгнэлт хуулах"}</button></div></>}
    </div>
  </section>;
}
