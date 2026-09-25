import {
  buildDevFilterSummary,
  DEV_FILTER_SUMMARY_INTRO,
  parseDevFilterSummaryInput,
  verifiedDevFilterIntroduction,
} from "../../../lib/dev-filter-summary";

export async function POST(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return Response.json({ error: "Хүсэлтийн өгөгдөл буруу байна." }, { status: 400 });
  }
  const input = parseDevFilterSummaryInput(value);
  if (!input) return Response.json({ error: "Шүүсэн тайлангийн өгөгдөл дутуу байна." }, { status: 400 });

  const local = () => Response.json({ summary: buildDevFilterSummary(input), source: "local" }, { headers: { "Cache-Control": "private, no-store" } });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return local();

  const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const defaultModel = "openai/gpt-oss-120b";
  const models = Array.from(new Set([process.env.GROQ_MODEL || defaultModel, defaultModel]));
  const prompt = `Та Монгол хэлний ажлын тайлангийн редактор. Шүүсэн ClickUp өгөгдлийн тайлбарын нэг өгүүлбэртэй оршил бич.
Imp болон Bug гэсэн нэрийг хоёуланг нь яг хэвээр оруул.
Тоон утга, хувь, хугацаа, шалтгаан, таамаг, өсөлт/бууралт, зөвлөмж бүү бич.
Зөвхөн {"introduction":"..."} JSON буцаа.
Fallback өгүүлбэр: ${DEV_FILTER_SUMMARY_INTRO}`;

  try {
    for (const model of models) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_completion_tokens: 350,
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
      const introduction = verifiedDevFilterIntroduction(candidate);
      const accepted = typeof candidate === "string" && introduction === candidate.trim().replace(/\s+/g, " ");
      return Response.json({ summary: buildDevFilterSummary(input, introduction), source: accepted ? "groq" : "local" }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return local();
  } catch {
    return local();
  }
}
