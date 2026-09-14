import { jsPDF } from "jspdf";
import { autoTable, type UserOptions } from "jspdf-autotable";
import { REPORT_COLORS as C, number, type WorkReport } from "./report";
import { reportNotes, reportSections, taskHeaders, taskRows } from "./report-sections";

function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return btoa(text);
}

export async function exportPdf(report: WorkReport, fonts?: { regular: ArrayBuffer; bold: ArrayBuffer }): Promise<Blob> {
  const loadFont = async (name: string) => {
    const response = await fetch(`/fonts/NotoSans-${name}.ttf`);
    if (!response.ok) throw new Error("PDF font unavailable");
    return response.arrayBuffer();
  };
  const [regular, bold] = fonts ? [fonts.regular, fonts.bold] : await Promise.all([loadFont("Regular"), loadFont("Bold")]);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS("NotoSans-Regular.ttf", base64(regular));
  doc.addFileToVFS("NotoSans-Bold.ttf", base64(bold));
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans");
  doc.setProperties({ title: `Ажлын тайлан · ${report.data.reportYear}`, author: "Cody · CX Dev.Team", subject: report.scope });
  const margin = 40;
  let y = 70;
  const width = () => doc.internal.pageSize.getWidth() - margin * 2;
  function text(value: string, size = 10, color = C.ink, weight = "normal", after = 12) {
    doc.setFont("NotoSans", weight); doc.setFontSize(size); doc.setTextColor(`#${color}`);
    const lines: string[] = doc.splitTextToSize(value, width());
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 65) { doc.addPage(); y = 62; }
      doc.text(line, margin, y); y += size * 1.45;
    }
    y += after;
  }
  const newPage = (landscape = false) => { doc.addPage("a4", landscape ? "landscape" : "portrait"); y = 68; };
  doc.setFillColor(`#${C.navy}`); doc.rect(0, 0, doc.internal.pageSize.getWidth(), 242, "F");
  text("CODY / CX DEV.TEAM", 12, "9CD6CA", "bold", 20);
  text("Ажлын тайлан", 34, C.white, "bold", 0);
  text(`${report.data.reportYear} · Гүйцэтгэлийн нэгтгэл`, 16, C.white, "normal", 10);
  text(report.scope, 10, "CAD8EB", "normal", 0);
  y = 285;
  const metrics = [
    [number(report.totals.tasks), "ГҮЙЦЭТГЭСЭН АЖИЛ"],
    [number(report.totals.estimateMs / 3_600_000, 1), "ESTIMATE · ЦАГ"],
    [number(report.totals.averageMinutes, 1), "ДУНДАЖ · МИН"],
  ];
  const cardWidth = (width() - 20) / 3;
  metrics.forEach(([value, label], index) => {
    const x = margin + index * (cardWidth + 10);
    doc.setFillColor(`#${C.pale}`); doc.roundedRect(x, y - 20, cardWidth, 85, 7, 7, "F");
    doc.setFont("NotoSans", "bold"); doc.setFontSize(26); doc.setTextColor(`#${index === 0 ? C.teal : C.navy}`); doc.text(value, x + 14, y + 15);
    doc.setFontSize(8); doc.text(label, x + 14, y + 43);
  });
  y += 100;
  text("Тайлангийн тухай", 15, C.navy, "bold", 4);
  reportNotes(report).forEach(note => text(note, 9, C.muted, "normal", 6));
  text("Агуулга", 15, C.navy, "bold", 5);
  text("Сарын гүйцэтгэл / Бүх ангилал / Ажилтны нэгтгэл / Хагас жилийн харьцуулалт / Өгөгдлийн чанар / Parent бүртгэл / Бүх ажлын хавсралт", 10, C.muted);

  newPage();
  text("Сарын гүйцэтгэл", 22, C.navy, "bold", 16);
  const chartTop = y + 10, chartHeight = 125, chartBottom = chartTop + chartHeight;
  const max = Math.max(1, ...report.monthly.map(month => month.tasks));
  const slot = width() / 12;
  report.monthly.forEach((month, index) => {
    const x = margin + index * slot + 7;
    const height = month.tasks / max * chartHeight;
    doc.setFillColor(`#${index >= 6 ? C.teal : C.coral}`); doc.rect(x, chartBottom - height, slot - 14, height, "F");
    doc.setFont("NotoSans"); doc.setFontSize(7); doc.setTextColor(`#${C.ink}`);
    doc.text(number(month.tasks), x + (slot - 14) / 2, chartBottom - height - 7, { align: "center" });
    doc.text(String(index + 1), x + (slot - 14) / 2, chartBottom + 16, { align: "center" });
  });
  y = chartBottom + 48;
  function table(headers: string[], rows: string[][], extra: Partial<UserOptions> = {}) {
    const ratios = headers.length === 5 ? [.35, .14, .17, .18, .16] : headers.length === 4 ? [.17, .42, .21, .20] : [.78, .22];
    const columnStyles = Object.fromEntries(ratios.map((ratio, index) => [index, { cellWidth: width() * ratio, ...(index > 0 && headers.length === 5 ? { halign: "right" as const } : {}) }]));
    autoTable(doc, {
      startY: y, margin: { top: 60, bottom: 48, left: margin, right: margin }, head: [headers], body: rows,
      theme: "plain", showHead: "everyPage", rowPageBreak: "avoid",
      styles: { font: "NotoSans", fontSize: 9, cellPadding: 8, overflow: "linebreak", textColor: `#${C.ink}`, lineColor: `#${C.line}`, lineWidth: { bottom: .35 } },
      headStyles: { fillColor: `#${C.navy}`, textColor: "#ffffff", fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: `#${C.pale}` }, columnStyles, ...extra,
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }
  const sections = reportSections(report);
  text(sections[0].note!, 9, C.muted, "normal", 8);
  table(sections[0].headers, sections[0].rows);
  for (const section of sections.slice(1)) {
    newPage(); text(section.title, 22, C.navy, "bold", 8);
    if (section.note) text(section.note, 9, C.muted);
    table(section.headers, section.rows);
  }
  if (report.context) {
    newPage(); text("Дэлгэцийн дүгнэлт", 22, C.navy, "bold", 8);
    text(report.context.label, 11, C.teal, "bold");
    for (const paragraph of report.context.text.split(/\n\s*\n/)) text(paragraph, 11);
  }
  newPage(true);
  text(`Бүх ажлын хавсралт · ${number(report.tasks.length)} ажил`, 21, C.navy, "bold", 4);
  text("ID дээр дарж ClickUp нээнэ. Parent-ийн нэрийг өмнөх бүртгэлээс үзнэ. Estimate: минут. Огноо: UTC.", 9, C.muted, "normal", 8);
  table(taskHeaders, taskRows(report), {
    styles: { font: "NotoSans", fontSize: 8, cellPadding: 6, overflow: "linebreak", textColor: `#${C.ink}`, lineColor: `#${C.line}`, lineWidth: { bottom: .3 } },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 123, textColor: `#${C.blue}` }, 2: { cellWidth: 83 }, 3: { cellWidth: 100 }, 4: { cellWidth: 102 }, 5: { cellWidth: 150 }, 6: { cellWidth: 90 }, 7: { cellWidth: width() - 682, halign: "right" } },
    didDrawCell: hook => {
      if (hook.section === "body" && hook.column.index === 1) doc.link(hook.cell.x, hook.cell.y, hook.cell.width, hook.cell.height, { url: `https://app.clickup.com/t/${encodeURIComponent(report.tasks[hook.row.index].id)}` });
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("NotoSans"); doc.setFontSize(8); doc.setTextColor(`#${C.muted}`);
    if (page > 1) { doc.text(`CODY / ${report.data.reportYear} АЖЛЫН ТАЙЛАН`, margin, 28); doc.setDrawColor(`#${C.line}`); doc.line(margin, 36, pageWidth - margin, 36); }
    doc.text(`ClickUp · ${report.data.syncedAt.slice(0, 10)} · ${number(report.tasks.length)} ажил`, margin, pageHeight - 24);
    doc.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }
  return doc.output("blob");
}
