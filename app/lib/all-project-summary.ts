export type AllProjectSummaryStatusKey = "todo" | "inProgress" | "qa" | "hold" | "done";

export type AllProjectSummaryInput = {
  period: string;
  totalProjects: number;
  doneEstimateMinutes: number;
  statuses: Record<AllProjectSummaryStatusKey, number>;
  partial?: boolean;
};

export type AllProjectSummary = {
  introduction: string;
  facts: AllProjectSummaryInput;
};

const STATUS_KEYS: AllProjectSummaryStatusKey[] = ["todo", "inProgress", "qa", "hold", "done"];
const MAX_COUNT = 1_000_000;
const MAX_MINUTES = 100_000_000;

function validInteger(value: unknown, maximum = MAX_COUNT): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

export function parseAllProjectSummaryInput(value: unknown): AllProjectSummaryInput | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<AllProjectSummaryInput>;
  const period = typeof payload.period === "string" ? payload.period.trim() : "";
  if (!period || period.length > 160 || !validInteger(payload.totalProjects) || !validInteger(payload.doneEstimateMinutes, MAX_MINUTES)) return null;
  if (!payload.statuses || typeof payload.statuses !== "object") return null;

  const statuses = {} as Record<AllProjectSummaryStatusKey, number>;
  for (const key of STATUS_KEYS) {
    const count = payload.statuses[key];
    if (!validInteger(count)) return null;
    statuses[key] = count;
  }
  if (Object.values(statuses).reduce((sum, count) => sum + count, 0) !== payload.totalProjects) return null;

  return {
    period,
    totalProjects: payload.totalProjects,
    doneEstimateMinutes: payload.doneEstimateMinutes,
    statuses,
    partial: payload.partial === true,
  };
}

export const ALL_PROJECT_SUMMARY_INTRO = "Сонгосон ClickUp шүүлтүүрийн үндсэн төслүүдийн гүйцэтгэл, төлөв болон тооцоолсон хугацааны мэдээллийг нэгтгэн харуулав.";

/** Groq may improve the introduction, but cannot add unverifiable figures, causes, forecasts or advice. */
export function verifiedAllProjectIntroduction(candidate: unknown) {
  if (typeof candidate !== "string") return ALL_PROJECT_SUMMARY_INTRO;
  const text = candidate.trim().replace(/\s+/g, " ");
  const lower = text.toLocaleLowerCase("en-US");
  const unsafe = /\d|%|шалтгаан|учир|нөлөөл|магад|таамаг|зөвлө|шаардлагатай|давамгай|ихэнх|цөөн|өс(?:сөн|өв)|буур(?:сан|ав)|ирэх|дараагийн/i.test(text);
  const unsupportedQuantity = /(?:^|[\s,.;:()])олон(?:[\s,.;:()]|$)/i.test(text);
  if (text.length < 35 || text.length > 260 || unsafe || unsupportedQuantity || !lower.includes("clickup") || !/төсл/i.test(lower)) return ALL_PROJECT_SUMMARY_INTRO;
  return text;
}

export function buildAllProjectSummary(input: AllProjectSummaryInput, introduction = ALL_PROJECT_SUMMARY_INTRO): AllProjectSummary {
  return {
    introduction,
    facts: {
      ...input,
      statuses: { ...input.statuses },
    },
  };
}

export function parseAllProjectSummary(value: unknown): AllProjectSummary | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<AllProjectSummary>;
  const facts = parseAllProjectSummaryInput(payload.facts);
  if (!facts || typeof payload.introduction !== "string") return null;
  const introduction = payload.introduction.trim().replace(/\s+/g, " ");
  if (verifiedAllProjectIntroduction(introduction) !== introduction) return null;
  return { introduction, facts };
}
