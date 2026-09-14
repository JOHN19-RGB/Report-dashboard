"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Download, FileSpreadsheet, FileText, LoaderCircle, X } from "lucide-react";
import { buildReport, filterLabel, filterTasks, number, type ReportContext, type ReportData, type ReportFilters } from "../lib/report";

type Format = "xlsx" | "docx" | "pdf";
const formats = [
  { id: "xlsx" as const, name: "Excel", extension: ".xlsx", title: "Шинжилгээ хийх", description: "Тусдаа хуудас, шүүлтүүр, тооцоолол", icon: FileSpreadsheet, color: "excel" },
  { id: "docx" as const, name: "Word", extension: ".docx", title: "Засварлаж, хуваалцах", description: "Нэгтгэл, хүснэгт, бүх ажлын хавсралт", icon: FileText, color: "word" },
  { id: "pdf" as const, name: "PDF", extension: ".pdf", title: "Уншиж, хэвлэх", description: "Бэлэн загвар, хуудаслалт, бүх ажил", icon: FileText, color: "pdf" },
];

export default function ReportDownload({ data, filters = {}, context }: { data: ReportData | null; filters?: ReportFilters; context?: ReportContext }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [format, setFormat] = useState<Format>("pdf");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedFilters = scope === "all" ? {} : filters;
  const count = data ? filterTasks(data, selectedFilters).length : 0;

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const close = () => { document.body.style.overflow = ""; trigger.current?.focus(); };
    modal.addEventListener("close", close);
    return () => { modal.removeEventListener("close", close); document.body.style.overflow = ""; };
  }, []);

  async function download() {
    if (!data || busy || !count) return;
    setBusy(true); setError(""); setMessage("Файл бэлтгэж байна…");
    try {
      const report = buildReport(data, selectedFilters, context);
      const { exportReport } = await import("../lib/export-report");
      const blob = await exportReport(report, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Cody-work-report-${data.reportYear}-${scope === "all" ? "all" : "filtered"}-${report.generatedAt.slice(0, 10)}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`${format.toUpperCase()} файл бэлэн · ${number(count)} ажил. Таталт эхэллээ.`);
    } catch (cause) {
      console.error("Report export failed", cause);
      setMessage(""); setError("Файл үүсгэж чадсангүй. Дахин оролдоно уу.");
    } finally { setBusy(false); }
  }

  return <>
    <button ref={trigger} className="export-button" disabled={!data} onClick={() => { setMessage(""); setError(""); dialog.current?.showModal(); document.body.style.overflow = "hidden"; }}><Download size={16} /><span>Тайлан татах</span></button>
    <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" onClick={event => { if (event.target === event.currentTarget && !busy) dialog.current?.close(); }} onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="export-dialog-head"><div className="export-heading-icon"><Download size={23} /></div><button className="icon-button" aria-label="Татах цонх хаах" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <div className="export-intro"><span className="panel-kicker">ТАНЫ ТАЙЛАН · ТАНЫ ФОРМАТ</span><h2 id="export-title">Өгөгдлөө тайлан болгоё.</h2><p>Нэгтгэлээс эхлээд ажил бүрийн дэлгэрэнгүй хүртэл.</p></div>
      <fieldset disabled={busy} className="export-format-fieldset"><legend>1. Файлын формат</legend><div className="export-formats">{formats.map(item => <label key={item.id} className={`export-format ${item.color} ${item.id !== "pdf" ? "unavailable" : ""} ${format === item.id ? "selected" : ""}`}><input type="radio" name="report-format" value={item.id} disabled={item.id !== "pdf"} checked={format === item.id} onChange={() => { setFormat(item.id); setMessage(""); }} /><span className="format-icon"><item.icon size={25} /></span><span className="format-check">{format === item.id && <Check size={13} />}</span><strong>{item.name}<small>{item.extension}</small></strong><b>{item.title}</b><span>{item.id !== "pdf" ? "Одоогоор татах боломжгүй" : item.description}</span></label>)}</div></fieldset>
      <fieldset disabled={busy} className="export-scope-fieldset"><legend>2. Тайлангийн хамрах хүрээ</legend><label className={scope === "all" ? "selected" : ""}><input type="radio" name="report-scope" checked={scope === "all"} onChange={() => { setScope("all"); setMessage(""); }} /><span><strong>Бүх өгөгдөл</strong><small>Бүх сар, бүх ажилтан · {number(data?.subtasks.length || 0)} ажил</small></span><span className="recommended-tag">БҮРЭН ТАЙЛАН</span></label><label className={scope === "filtered" ? "selected" : ""}><input type="radio" name="report-scope" checked={scope === "filtered"} onChange={() => { setScope("filtered"); setMessage(""); }} /><span><strong>Одоогийн шүүлтүүр</strong><small>{data ? filterLabel(data, filters) : "Өгөгдөл уншиж байна"}</small></span></label></fieldset>
      <div className="export-includes"><strong><CheckCircle2 size={16} />Файлд юу багтах вэ?</strong><p>Гол үзүүлэлт · Сарын гүйцэтгэл · Бүх ажлын ангилал · Ажилтны нэгтгэл · Хагас жилийн харьцуулалт · Өгөгдлийн чанар · Parent task · Бүх {number(count)} ажлын дэлгэрэнгүй</p>{context && <p>Дэлгэцийн дүгнэлт: {context.label}</p>}<small>Эх сурвалж: ClickUp · {data?.syncedAt ? `Синк: ${new Date(data.syncedAt).toLocaleString("mn-MN")}` : "—"}</small>{data?.partial && <p className="export-warning">Эх сурвалжийн зарим өгөгдөл дутуу байна. Энэ төлөв файлд тэмдэглэгдэнэ.</p>}</div>
      <div role="status" aria-live="polite" className={`export-status ${error ? "has-error" : ""}`}>{error || message || (count === 0 ? "Сонгосон шүүлтүүрт ажил алга. Бүх өгөгдлийг сонгоно уу." : `${number(count)} ажил · Хуудасны хязгааргүй экспорт`)}</div>
      <div className="export-dialog-foot"><span>Нэгдсэн өнгө, уншихад хялбар загвар</span><button className="export-confirm" disabled={busy || !count} onClick={() => void download()}>{busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}{busy ? "Бэлтгэж байна…" : `${format.toUpperCase()} татах`}</button></div>
    </dialog>
  </>;
}
