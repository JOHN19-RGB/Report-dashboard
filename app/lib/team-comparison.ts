import type { DevTask } from "./dev-report";
import type { ReportData } from "./report";

export type TeamComparison = {
  monthKey: string;
  period: string;
  cx: { bug: number; imp: number };
  dev: { bug: number; imp: number };
  difference: { bug: number; imp: number };
  partial: boolean;
  cxSyncedAt: string;
  devSyncedAt: string;
};

export function comparisonTaskType(value: string): "bug" | "imp" | null {
  const type = value.trim().toLowerCase();
  if (type === "bug") return "bug";
  if (["imp", "improvement", "imp- functional", "imp- performance"].includes(type)) return "imp";
  return null;
}

/** Same UTC due-date month and completed statuses for both teams, independent of dashboard filters. */
export function buildTeamComparison(cx: ReportData, dev: { tasks: DevTask[]; taskPartial?: boolean; syncedAt: string }, monthKey: string): TeamComparison {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) || Number(monthKey.slice(0, 4)) !== cx.reportYear) throw new Error("CX тайлангийн жилтэй тохирох сар сонгоно уу.");
  const cxCounts = { bug: 0, imp: 0 };
  const devCounts = { bug: 0, imp: 0 };
  const seenCx = new Set<string>();
  const seenDev = new Set<string>();
  for (const task of cx.subtasks) {
    const date = task.dueDate && /^\d+$/.test(task.dueDate) ? new Date(Number(task.dueDate)) : null;
    const key = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : null;
    const done = ["complete", "completed", "closed", "done"].includes(task.status.name.trim().toLowerCase()) || ["closed", "done"].includes(task.status.type.toLowerCase());
    const type = comparisonTaskType(task.type?.name || "");
    if (task.id && !seenCx.has(task.id) && key === monthKey && done && type) {
      seenCx.add(task.id);
      cxCounts[type] += 1;
    }
  }
  for (const task of dev.tasks) {
    const type = comparisonTaskType(task.type);
    if (task.id && !seenDev.has(task.id) && task.dueDate?.slice(0, 7) === monthKey && task.status.done && type) {
      seenDev.add(task.id);
      devCounts[type] += 1;
    }
  }
  return {
    monthKey,
    period: `${monthKey.slice(0, 4)} оны ${Number(monthKey.slice(5))}-р сарын дүгнэлт`,
    cx: cxCounts,
    dev: devCounts,
    difference: { bug: cxCounts.bug - devCounts.bug, imp: cxCounts.imp - devCounts.imp },
    partial: Boolean(cx.partial || dev.taskPartial),
    cxSyncedAt: cx.syncedAt,
    devSyncedAt: dev.syncedAt,
  };
}

export const COMPARISON_INTRO = "CX хөгжүүлэлтийн хэлтэс болон Технологийн хөгжүүлэлтийн хэлтсийн Bug болон Improvement (IMP) төрлийн гүйцэтгэсэн таскуудын бүртгэлийг харьцуулан дүн шинжилгээ хийв.";

export function comparisonSummary(facts: TeamComparison, introduction = COMPARISON_INTRO) {
  const difference = (name: string, value: number) => `${name}: ${Math.abs(value)} таскийн тоон зөрүү${value ? ` (CX ${value > 0 ? "их" : "бага"})` : ""}`;
  return `${facts.period}\n\nBug болон Improvement (IMP) таскуудын дүгнэлт\n\n${introduction}\n\nТайлант хугацаанд:\nCX хөгжүүлэлтийн хэлтэс\nBug task: ${facts.cx.bug}\nIMP task: ${facts.cx.imp}\n\nТехнологийн хөгжүүлэлтийн хэлтэс · B2C, сонгосон 5 ажилтан\nBug task: ${facts.dev.bug}\nIMP task: ${facts.dev.imp}\n\n${difference("Bug", facts.difference.bug)}; ${difference("IMP", facts.difference.imp)}. Энэ нь бүртгэлийн тооны харьцуулалт бөгөөд ижил task ID-аар хийсэн тулгалт биш.\n\nДотоод Bug/IMP таскийг ялгах баталгаатай талбар байхгүй тул тусад нь тооцоогүй. Зөрүүний шалтгаан болон систем шилжүүлгийн мэдээлэл энэ өгөгдлөөр баталгаажаагүй.\n\nТооцоолол: ижил жилийн сар, UTC Due date, гүйцэтгэсэн status; CX Functional + Performance = IMP. Task ID давхардлыг баг тус бүрт нэг удаа тооцов. Өнөөгийн status ашигласан; сарын эцсийн архив биш.${facts.partial ? "\n\nАнхааруулга: эх өгөгдөл дутуу тул тоонууд бүрэн бус байж болно." : ""}`;
}

/** AI may edit the introduction only. Every numeric fact and caveat remains deterministic. */
export function verifiedComparisonIntroduction(value: unknown) {
  if (typeof value !== "string" || value.length < 50 || value.length > 450 || /[0-9\n<>]/.test(value)) return COMPARISON_INTRO;
  if (!/CX/.test(value) || !/IMP/.test(value) || !/Технологийн/.test(value) || !/харьцуул/.test(value) || !/гүйцэтгэ/.test(value)) return COMPARISON_INTRO;
  if (/шалтгаан|улмаас|үүдэл|бүртгэгдээгүй|алдаа|өссөн|буурсан|зөвлөмж|дотоод|шилжүүл|зөрүү/.test(value.toLowerCase())) return COMPARISON_INTRO;
  return value.trim();
}
