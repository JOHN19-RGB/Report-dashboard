import {
  ALL_PROJECT_SUMMARY_INTRO,
  buildAllProjectSummary,
  parseAllProjectSummaryInput,
  verifiedAllProjectIntroduction,
} from "../../../../lib/all-project-summary";

export async function POST(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return Response.json({ error: "Хүсэлтийн өгөгдөл буруу байна." }, { status: 400 });
  }

  const input = parseAllProjectSummaryInput(value);
  if (!input) return Response.json({ error: "Төслийн дүгнэлтийн өгөгдөл дутуу байна." }, { status: 400 });

  const local = () => Response.json(
    { summary: buildAllProjectSummary(input), source: "local" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return local();

  const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const defaultModel = "openai/gpt-oss-20b";
  const models = Array.from(new Set([
    process.env.GROQ_FAST_MODEL || process.env.GROQ_MODEL || defaultModel,
    process.env.GROQ_MODEL,
    defaultModel,
    "openai/gpt-oss-120b",
  ].filter((model): model is string => Boolean(model))));
  const statusLabels = { todo: "To do", inProgress: "In Progress", qa: "QA test", hold: "Hold", done: "Done" } as const;
  const activeStatuses = Object.entries(input.statuses).filter(([, count]) => count > 0).map(([key]) => statusLabels[key as keyof typeof statusLabels]).join(", ") || "төлөвгүй";
  const prompt = `Та Монгол хэлний төслийн гүйцэтгэлийн тайлангийн редактор. ClickUp-аас баталгаажсан үндсэн төслүүдийн дүгнэлтэд зориулж нэг өгүүлбэртэй, товч, мэргэжлийн оршил бич.
Оршилд ClickUp болон үндсэн төслүүдийг заавал дурд.
Интерфэйс баталгаажсан тоон дэлгэрэнгүйг тусад нь харуулах тул ямар ч тоо, хувь, хугацаа, шалтгаан, таамаг, тархалтын дүгнэлт, өсөлт/бууралт эсвэл зөвлөмж бүү бич.
Хамаарах ClickUp төлөвүүд: ${activeStatuses}. Тэдгээрийн тоо, харьцаа эсвэл давамгай байдлыг бүү таамагла.
Зөвхөн {"introduction":"..."} JSON буцаа.
Fallback өгүүлбэр: ${ALL_PROJECT_SUMMARY_INTRO}`;

  try {
    for (const model of models) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_completion_tokens: 400,
          ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (response.status === 404) continue;
      if (!response.ok) return local();
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = (data.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
      let candidate: unknown;
      try { candidate = (JSON.parse(content) as { introduction?: unknown }).introduction; } catch { candidate = null; }
      const introduction = verifiedAllProjectIntroduction(candidate);
      const accepted = typeof candidate === "string" && introduction === candidate.trim().replace(/\s+/g, " ");
      return Response.json(
        { summary: buildAllProjectSummary(input, introduction), source: accepted ? "groq" : "local" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return local();
  } catch {
    return local();
  }
}
