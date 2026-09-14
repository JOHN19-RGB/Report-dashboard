import type { WorkReport } from "./report";

export async function exportReport(report: WorkReport, format: "xlsx" | "docx" | "pdf"): Promise<Blob> {
  if (format === "pdf") return (await import("./export-pdf")).exportPdf(report);
  throw new Error("Excel and Word export setup pending");
}
