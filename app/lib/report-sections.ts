import { dateLabel, number, totals, type WorkReport } from "./report";

export type ReportSection = { title: string; note?: string; headers: string[]; rows: string[][] };
export function reportSections(report: WorkReport): ReportSection[] {
  const metricHeaders = ["Үзүүлэлт", "Ажлын тоо", "Estimate (цаг)", "Estimate-тэй ажил", "Дундаж (мин)"];
  const metricRow = (item: { name: string; tasks: number; estimateMs: number; estimatedTasks: number; averageMinutes: number }) => [item.name, number(item.tasks), number(item.estimateMs / 3_600_000, 2), number(item.estimatedTasks), number(item.averageMinutes, 1)];
  return [
    { title: "Сарын гүйцэтгэл", note: "Сарыг Due date-ийн UTC огноогоор тооцов. Огноогүй ажлыг нийт дүнд оруулж, сарын задаргаанд оруулаагүй.", headers: metricHeaders, rows: report.monthly.map(metricRow) },
    { title: "Ажлын бүх ангилал", headers: metricHeaders, rows: report.categories.map(metricRow) },
    { title: "Ажилтны гүйцэтгэл", note: "Сайтын нэгтгэлтэй адил Daily Task parent-ийн эзэмшигчээр бүлэглэв. Assignment-ийг ажлын хавсралтад тусад нь харуулав.", headers: metricHeaders, rows: [...report.people.map(metricRow), ...(report.ungrouped.tasks ? [metricRow({ name: "Бусад / эзэмшигчгүй", ...report.ungrouped })] : [])] },
    { title: "Хагас жилийн харьцуулалт", note: "Сонгосон хамрах хүрээнд байгаа ажлууд. Хагас жилийн хугацаанууд бүрэн эсэх нь эх сурвалж болон шүүлтүүрээс хамаарна.", headers: metricHeaders, rows: report.halves.map(metricRow) },
    { title: "Өгөгдлийн чанар", headers: ["Талбар", "Дутуу ажлын тоо"], rows: report.quality.map(item => [item.name, number(item.count)]) },
    { title: "Daily Task parent бүртгэл", headers: ["Parent ID", "Нэр", "Эзэмшигч", "Тайланд багтсан ажил"], rows: report.parents.map(parent => [parent.id, parent.name, parent.assignees.map(person => person.name).join(", ") || "Оруулаагүй", number(totals(report.tasks.filter(task => task.parentId === parent.id)).tasks)]) },
  ];
}
export function taskRows(report: WorkReport) {
  return report.tasks.map((task, index) => [String(index + 1), [task.id, task.name].filter(Boolean).join("\n"), task.parentId, task.assignment.map(person => person.name).join(", ") || "Оруулаагүй", [task.status.name, task.status.type].filter(Boolean).join(" / "), task.type?.name || "Тодорхойгүй", dateLabel(task.dueDate), task.timeEstimate ? number(task.timeEstimate / 60_000, 2) : "Оруулаагүй"]);
}
export const taskHeaders = ["№", "Ажил / ID", "Parent ID", "Assignment", "Status / төрөл", "Type", "Due date", "Estimate (мин)"];
export function reportNotes(report: WorkReport) {
  return [
    `Эх сурвалж: ${report.data.workspace?.name || "ClickUp"} · ${report.data.list.name} (${report.data.list.id}).`,
    `Синк: ${report.data.syncedAt}. Файл үүсгэсэн: ${report.generatedAt}.`,
    `Хамрах хүрээ: ${report.scope}. Нийт ${number(report.tasks.length)} хадгалсан complete subtask.`,
    "Time estimate нь төлөвлөсөн хугацаа бөгөөд бодитоор ажилласан цаг биш. Оруулаагүй утгыг тэг цагтай ажил гэж үзээгүй; дундажийг зөвхөн estimate-тэй ажлаар тооцов.",
    report.data.partial ? "Эх сурвалжийн зарим өгөгдөл дутуу байна." : "Тайланд сонгосон хамрах хүрээний бүх хадгалсан ажил багтсан.",
    report.tasks.some(task => !task.name) ? "Энэ snapshot-д зарим ажлын нэр хадгалагдаагүй тул ID-г харуулав. ID холбоосоор ClickUp дээр дэлгэрэнгүйг нээнэ." : "Ажлын ID холбоосоор ClickUp дээр дэлгэрэнгүйг нээнэ.",
  ];
}
