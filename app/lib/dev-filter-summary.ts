export type DevPriorityCounts = {
  urgent: number;
  high: number;
  medium: number;
  low: number;
  unspecified: number;
};

export type DevTaskTypeSummaryInput = {
  count: number;
  estimateMinutes: number;
  previousCount: number | null;
};

export type DevNamedCount = {
  name: string;
  count: number;
};

export type DevFilterSummaryInput = {
  period: string;
  previousPeriod: string;
  filter: {
    taskType: string;
    sprint: string;
    search: string;
  };
  breakdown: {
    types: DevNamedCount[];
    statuses: DevNamedCount[];
  };
  imp: DevTaskTypeSummaryInput & { priorities: DevPriorityCounts };
  bug: DevTaskTypeSummaryInput;
  partial?: boolean;
};

export type DevFilterSummary = {
  introduction: string;
  impText: string;
  bugText: string;
  facts: {
    breakdown: {
      types: DevNamedCount[];
      statuses: DevNamedCount[];
    };
    imp: DevTaskTypeSummaryInput & { priorities: DevPriorityCounts; changePercent: number | null };
    bug: DevTaskTypeSummaryInput & { changePercent: number | null };
  };
};

const MAX_COUNT = 1_000_000;
const MAX_MINUTES = 100_000_000;

function validInteger(value: unknown, maximum = MAX_COUNT): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validPrevious(value: unknown): value is number | null {
  return value === null || validInteger(value);
}

function validLabel(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

function validOptionalLabel(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length <= maximum;
}

function validTaskSummary(value: unknown): value is DevTaskTypeSummaryInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DevTaskTypeSummaryInput>;
  return validInteger(item.count) && validInteger(item.estimateMinutes, MAX_MINUTES) && validPrevious(item.previousCount);
}

function parsedNamedCounts(value: unknown): DevNamedCount[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result: DevNamedCount[] = [];
  const names = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Partial<DevNamedCount>;
    if (!validLabel(item.name, 100) || !validInteger(item.count) || item.count === 0) return null;
    const name = item.name.trim();
    const key = name.toLocaleLowerCase("en-US");
    if (names.has(key)) return null;
    names.add(key);
    result.push({ name, count: item.count });
  }
  return result;
}

export function parseDevFilterSummaryInput(value: unknown): DevFilterSummaryInput | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<DevFilterSummaryInput>;
  const types = parsedNamedCounts(payload.breakdown?.types);
  const statuses = parsedNamedCounts(payload.breakdown?.statuses);
  if (
    !validLabel(payload.period, 120) ||
    !validOptionalLabel(payload.previousPeriod, 120) ||
    !payload.filter ||
    !validLabel(payload.filter.taskType, 80) ||
    !validOptionalLabel(payload.filter.sprint, 120) ||
    !validOptionalLabel(payload.filter.search, 160) ||
    !validTaskSummary(payload.imp) ||
    !validTaskSummary(payload.bug) ||
    !payload.imp.priorities ||
    !types ||
    !statuses
  ) return null;

  const priorities = payload.imp.priorities;
  const typeTotal = types.reduce((sum, item) => sum + item.count, 0);
  const statusTotal = statuses.reduce((sum, item) => sum + item.count, 0);
  if (
    !validInteger(priorities.urgent) ||
    !validInteger(priorities.high) ||
    !validInteger(priorities.medium) ||
    !validInteger(priorities.low) ||
    !validInteger(priorities.unspecified) ||
    Object.values(priorities).reduce((sum, count) => sum + count, 0) !== payload.imp.count ||
    typeTotal !== statusTotal ||
    ((payload.imp.previousCount !== null || payload.bug.previousCount !== null) && !payload.previousPeriod.trim())
  ) return null;

  return {
    period: payload.period.trim(),
    previousPeriod: payload.previousPeriod.trim(),
    filter: {
      taskType: payload.filter.taskType.trim(),
      sprint: payload.filter.sprint.trim(),
      search: payload.filter.search.trim(),
    },
    breakdown: { types, statuses },
    imp: {
      count: payload.imp.count,
      estimateMinutes: payload.imp.estimateMinutes,
      previousCount: payload.imp.previousCount,
      priorities: { ...priorities },
    },
    bug: {
      count: payload.bug.count,
      estimateMinutes: payload.bug.estimateMinutes,
      previousCount: payload.bug.previousCount,
    },
    partial: payload.partial === true,
  };
}

function number(value: number) {
  return value.toLocaleString("mn-MN");
}

export function summaryDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} минут`;
  return minutes ? `${hours} цаг ${minutes} минут` : `${hours} цаг`;
}

export function summaryPercentChange(current: number, previous: number | null) {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous * 100;
}

function comparisonText(input: DevFilterSummaryInput, label: "Imp" | "Bug", current: number, previous: number | null) {
  if (previous === null || !input.previousPeriod) return "Өмнөх sprint-тэй харьцуулах өгөгдөл сонгогдоогүй байна.";
  if (previous === 0 && current > 0) return `${input.previousPeriod}-д ${label} таск бүртгэгдээгүй тул хувийн өөрчлөлт тооцох боломжгүй.`;
  const change = summaryPercentChange(current, previous) || 0;
  if (Math.abs(change) < 0.05) return `${input.previousPeriod}-тэй харьцуулахад ${label} таскийн тоо өөрчлөлтгүй байна.`;
  return `${input.previousPeriod}-тэй харьцуулахад ${input.period}-д ${label} таск ${Math.abs(change).toFixed(1)}%-иар ${change > 0 ? "өссөн" : "буурсан"} үзүүлэлттэй байна.`;
}

function priorityText(priorities: DevPriorityCounts) {
  return [
    priorities.urgent ? `URGENT – ${number(priorities.urgent)}` : "",
    `HIGH – ${number(priorities.high)}`,
    `MEDIUM – ${number(priorities.medium)}`,
    `LOW – ${number(priorities.low)}`,
    priorities.unspecified ? `ТОДОРХОЙГҮЙ – ${number(priorities.unspecified)}` : "",
  ].filter(Boolean).join(", ");
}

export const DEV_FILTER_SUMMARY_INTRO = "Сонгосон шүүлтүүрийн Imp болон Bug таскийн бүртгэл, priority, time estimate, өмнөх үеийн харьцуулалтыг нэгтгэв.";

/** Groq may phrase one introduction, but it cannot introduce numbers, causes, trends or recommendations. */
export function verifiedDevFilterIntroduction(candidate: unknown) {
  if (typeof candidate !== "string") return DEV_FILTER_SUMMARY_INTRO;
  const text = candidate.trim().replace(/\s+/g, " ");
  const lower = text.toLocaleLowerCase("en-US");
  const unsafe = /\d|шалтгаан|учир|нөлөөл|магад|таамаг|зөвлө|шаардлагатай|өс(?:сөн|өв)|буур(?:сан|ав)|ирэх|дараагийн/i.test(text);
  if (text.length < 35 || text.length > 240 || unsafe || !lower.includes("imp") || !lower.includes("bug")) return DEV_FILTER_SUMMARY_INTRO;
  return text;
}

export function buildDevFilterSummary(input: DevFilterSummaryInput, introduction = DEV_FILTER_SUMMARY_INTRO): DevFilterSummary {
  const partialNote = input.partial ? " Эх өгөгдлийн зарим хэсэг бүрэн шинэчлэгдээгүй." : "";
  const impChange = summaryPercentChange(input.imp.count, input.imp.previousCount);
  const bugChange = summaryPercentChange(input.bug.count, input.bug.previousCount);
  return {
    introduction,
    impText: `Тухайн ${input.period}-д нийт нэмэлт хүсэлтийн ${number(input.imp.count)} таск бүртгэгдсэн. ClickUp Priority талбараар ангилбал ${priorityText(input.imp.priorities)} бөгөөд нийт time estimate ${summaryDuration(input.imp.estimateMinutes)} байна. ${comparisonText(input, "Imp", input.imp.count, input.imp.previousCount)}${partialNote}`,
    bugText: `Тухайн ${input.period}-д нийт Bug ${number(input.bug.count)} бүртгэгдсэн бөгөөд нийт time estimate ${summaryDuration(input.bug.estimateMinutes)} байна. ${comparisonText(input, "Bug", input.bug.count, input.bug.previousCount)}${partialNote}`,
    facts: {
      breakdown: {
        types: input.breakdown.types.map(item => ({ ...item })),
        statuses: input.breakdown.statuses.map(item => ({ ...item })),
      },
      imp: { ...input.imp, changePercent: impChange },
      bug: { ...input.bug, changePercent: bugChange },
    },
  };
}
