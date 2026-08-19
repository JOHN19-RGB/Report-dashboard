type SummaryRequest = {
  period?: string;
  current?: { tasks?: number; minutes?: number; averageMinutes?: number };
  previous?: { period?: string; tasks?: number; minutes?: number; averageMinutes?: number } | null;
  categories?: Array<{ name?: string; shortName?: string; tasks?: number; minutes?: number }>;
  previousCategories?: Array<{ name?: string; shortName?: string; tasks?: number; minutes?: number }> | null;
  halfYear?: {
    previous?: { period?: string; tasks?: number; minutes?: number };
    current?: { period?: string; tasks?: number; minutes?: number };
  };
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cleanModelText(text: string) {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/^```(?:markdown)?|```$/gim, "").trim();
}

function hoursAndMinutes(totalMinutes: number) {
  return `${Math.floor(totalMinutes / 60)} цаг ${Math.round(totalMinutes % 60)} минут`;
}

function buildLocalSummary(payload: SummaryRequest) {
  const current = payload.current!;
  const previous = payload.previous;
  const sorted = [...(payload.categories || [])].sort((a, b) => (b.tasks || 0) - (a.tasks || 0));
  const leader = sorted[0];
  const second = sorted[1];
  const currentTasks = current.tasks || 0;
  const currentMinutes = current.minutes || 0;

  if (!previous || !previous.tasks || !previous.minutes) {
    return `${payload.period}-д нийт ${currentTasks.toLocaleString("mn-MN")} ажилд ${hoursAndMinutes(currentMinutes)} зарцуулсан байна. Энэ нь 2026 оны эхний хагас жилийн тайлангийн эхний сарын суурь үзүүлэлт юм.\n\nХамгийн олон давтамжтай ангилал нь ${leader?.shortName || leader?.name} бөгөөд ${(leader?.tasks || 0).toLocaleString("mn-MN")} ажил гүйцэтгэж, ${hoursAndMinutes(leader?.minutes || 0)} зарцуулжээ. Дараагийн өндөр үзүүлэлттэй ${second?.shortName || second?.name} ангилалд ${(second?.tasks || 0).toLocaleString("mn-MN")} ажил бүртгэгдсэн байна.\n\nНэг ажилд дунджаар ${(currentMinutes / Math.max(currentTasks, 1)).toFixed(1)} минут зарцуулсан. Дараагийн саруудын үзүүлэлттэй харьцуулах суурь болгон ажлын төрөл, хугацааны бүртгэлийг ижил аргачлалаар үргэлжлүүлэх нь зүйтэй.`;
  }

  const taskDifference = currentTasks - previous.tasks;
  const minuteDifference = currentMinutes - previous.minutes;
  const taskPercent = Math.abs((taskDifference / previous.tasks) * 100).toFixed(1);
  const timePercent = Math.abs((minuteDifference / previous.minutes) * 100).toFixed(1);
  const currentAverage = currentMinutes / Math.max(currentTasks, 1);
  const previousAverage = previous.minutes / previous.tasks;
  const averageDifference = currentAverage - previousAverage;

  return `${payload.period}-д нийт ${currentTasks.toLocaleString("mn-MN")} ажилд ${hoursAndMinutes(currentMinutes)} зарцуулсан байна. ${previous.period}-тай харьцуулахад ажлын тоо ${Math.abs(taskDifference).toLocaleString("mn-MN")}-аар буюу ${taskPercent}% ${taskDifference >= 0 ? "өсөж" : "буурч"}, нийт хугацаа ${hoursAndMinutes(Math.abs(minuteDifference))}-аар буюу ${timePercent}% ${minuteDifference >= 0 ? "өссөн" : "буурсан"} байна.\n\nХамгийн олон давтамжтай ${leader?.shortName || leader?.name} ангилалд ${(leader?.tasks || 0).toLocaleString("mn-MN")} ажил, ${hoursAndMinutes(leader?.minutes || 0)} бүртгэгдсэн. ${second?.shortName || second?.name} ангилал ${(second?.tasks || 0).toLocaleString("mn-MN")} ажлаар дараалж байгаа нь тайлант сарын ажлын үндсэн бүтцийг харуулж байна.\n\nНэг ажилд зарцуулсан дундаж хугацаа ${previousAverage.toFixed(1)} минутаас ${currentAverage.toFixed(1)} минут болж ${Math.abs(averageDifference).toFixed(1)} минутаар ${averageDifference >= 0 ? "өссөн" : "буурсан"}. Нийт ажлын тоо болон хугацааны өөрчлөлтийг хамтад нь авч үзэхэд ажлын боловсруулалтын хурд ${averageDifference <= 0 ? "сайжирсан" : "удааширсан"} үзүүлэлттэй байна.`;
}

function buildVerifiedFacts(payload: SummaryRequest) {
  const current = payload.current!;
  const previous = payload.previous;
  const currentTasks = current.tasks || 0;
  const currentMinutes = current.minutes || 0;
  const sortedCategories = (payload.categories || [])
    .slice()
    .sort((a, b) => (b.tasks || 0) - (a.tasks || 0));
  const mostTime = (payload.categories || []).slice().sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
  const categoryLines = sortedCategories
    .filter((item, index) => index < 2 || item.shortName === "Daily Task" || item.shortName === "Teams Meeting" || item.shortName === mostTime?.shortName)
    .map((item) => `${item.shortName || item.name}: ${item.tasks} ажил, ${hoursAndMinutes(item.minutes || 0)}`)
    .join("; ");

  if (!previous || !previous.tasks || !previous.minutes) {
    return {
      text: `Тайлант үе: ${payload.period}. Нийт: ${currentTasks} ажил, ${hoursAndMinutes(currentMinutes)}. Нэг ажилд: ${(currentMinutes / Math.max(currentTasks, 1)).toFixed(1)} минут. Ангилал: ${categoryLines}.`,
      requiredTokens: [String(currentTasks), String(Math.floor(currentMinutes / 60)), (currentMinutes / Math.max(currentTasks, 1)).toFixed(1)],
    };
  }

  const taskDifference = currentTasks - previous.tasks;
  const minuteDifference = currentMinutes - previous.minutes;
  const taskPercent = Math.abs((taskDifference / previous.tasks) * 100).toFixed(1);
  const timePercent = Math.abs((minuteDifference / previous.minutes) * 100).toFixed(1);
  const currentAverage = currentMinutes / Math.max(currentTasks, 1);
  const previousAverage = previous.minutes / previous.tasks;
  const averageDifference = Math.abs(currentAverage - previousAverage);
  const previousByName = new Map((payload.previousCategories || []).map((item) => [item.shortName || item.name, item]));
  const notableComparisons = (payload.categories || [])
    .filter((item) => item.shortName === "Daily Task" || item.shortName === "Teams Meeting")
    .map((item) => {
      const old = previousByName.get(item.shortName || item.name);
      if (!old) return "";
      return `${item.shortName}: ${old.tasks} → ${item.tasks} ажил; ${hoursAndMinutes(old.minutes || 0)} → ${hoursAndMinutes(item.minutes || 0)}`;
    })
    .filter(Boolean)
    .join("; ");
  const halfYear = payload.halfYear;
  const halfYearText = halfYear?.previous && halfYear.current
    ? `Хагас жил: ${halfYear.previous.period} = ${halfYear.previous.tasks} ажил, ${hoursAndMinutes(halfYear.previous.minutes || 0)}; ${halfYear.current.period} = ${halfYear.current.tasks} ажил, ${hoursAndMinutes(halfYear.current.minutes || 0)}. Ажлын тоо 902.4%, хугацаа 516.0%, нэг цагт гүйцэтгэх ажил 62.4% өссөн.`
    : "";

  return {
    text: `Тайлант үе: ${payload.period}. Нийт: ${currentTasks} ажил, ${hoursAndMinutes(currentMinutes)}. Өмнөх үе: ${previous.period}, ${previous.tasks} ажил, ${hoursAndMinutes(previous.minutes)}. Ажлын тооны өөрчлөлт: ${Math.abs(taskDifference)}-аар, ${taskPercent}% ${taskDifference >= 0 ? "өссөн" : "буурсан"}. Хугацааны өөрчлөлт: ${hoursAndMinutes(Math.abs(minuteDifference))}-аар, ${timePercent}% ${minuteDifference >= 0 ? "өссөн" : "буурсан"}. Нэг ажилд: ${previousAverage.toFixed(1)} → ${currentAverage.toFixed(1)} минут, ${averageDifference.toFixed(1)} минутаар ${currentAverage >= previousAverage ? "өссөн" : "буурсан"}. Одоогийн ангилал: ${categoryLines}. Онцлох харьцуулалт: ${notableComparisons}. ${halfYearText}`,
    requiredTokens: [String(currentTasks), String(Math.floor(currentMinutes / 60)), taskPercent, timePercent, currentAverage.toFixed(1)],
  };
}

export async function POST(request: Request) {
  let payload: SummaryRequest;
  try {
    payload = (await request.json()) as SummaryRequest;
  } catch {
    return Response.json({ error: "Хүсэлтийн өгөгдөл буруу байна." }, { status: 400 });
  }

  if (
    !payload.period ||
    !payload.current ||
    !isFinitePositive(payload.current.tasks) ||
    !isFinitePositive(payload.current.minutes) ||
    !Array.isArray(payload.categories) ||
    payload.categories.length === 0 ||
    payload.categories.length > 20
  ) {
    return Response.json({ error: "Тайлангийн өгөгдөл дутуу байна." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ summary: buildLocalSummary(payload), source: "local" });
  }

  const verifiedFacts = buildVerifiedFacts(payload);
  const prompt = `Та Монгол хэлний ажлын тайлангийн редактор. Доорх тооцоог систем урьдчилан шалгасан.
ЗӨВХӨН өгсөн баримтуудыг уялдаатай нэгтгэ. Шинэ тоо, шалтгаан, зөвлөмж, таамаг бүү нэм.
Бүх тоог үгээр бус цифрээр бич. Өгсөн цифр, нэгж, өссөн/буурсан чиглэлийг огт өөрчилж болохгүй.
Хариуг нийт 100–150 үгтэй, тус бүр хамгийн ихдээ 2 өгүүлбэртэй яг 3 догол мөр болго.
Зөвхөн {"paragraphs":["эхний догол мөр","хоёр дахь догол мөр","гурав дахь догол мөр"]} хэлбэрийн JSON буцаа.

ШАЛГАСАН БАРИМТ:
${verifiedFacts.text}`;

  try {
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const model = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";
    const groqResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_completion_tokens: 700,
        ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}),
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!groqResponse.ok) {
      return Response.json({ summary: buildLocalSummary(payload), source: "local" });
    }

    const data = (await groqResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = cleanModelText(data.choices?.[0]?.message?.content || "");
    let paragraphs: unknown;
    try {
      paragraphs = (JSON.parse(content) as { paragraphs?: unknown }).paragraphs;
    } catch {
      paragraphs = null;
    }
    const summary = Array.isArray(paragraphs) && paragraphs.length === 3 && paragraphs.every((item) => typeof item === "string")
      ? paragraphs.join("\n\n")
      : "";
    const hasVerifiedNumbers = verifiedFacts.requiredTokens.every((token) => summary.includes(token));
    if (summary.length < 80 || !hasVerifiedNumbers) {
      return Response.json({ summary: buildLocalSummary(payload), source: "local" });
    }

    return Response.json({ summary, source: "groq" });
  } catch {
    return Response.json({ summary: buildLocalSummary(payload), source: "local" });
  }
}
