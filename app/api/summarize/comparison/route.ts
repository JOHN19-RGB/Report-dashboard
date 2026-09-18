import { COMPARISON_INTRO, comparisonSummary, verifiedComparisonIntroduction, type TeamComparison } from "../../../lib/team-comparison";

function validCounts(value: unknown): value is { bug: number; imp: number } {
  if (!value || typeof value !== "object") return false;
  const counts = value as { bug?: unknown; imp?: unknown };
  return [counts.bug, counts.imp].every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000);
}

export async function POST(request: Request) {
  let payload: Partial<TeamComparison>;
  try { payload = await request.json(); } catch { return Response.json({ error: "Хүсэлтийн өгөгдөл буруу байна." }, { status: 400 }); }
  if (!payload || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.monthKey || "") || !validCounts(payload.cx) || !validCounts(payload.dev)) return Response.json({ error: "Харьцуулалтын өгөгдөл дутуу байна." }, { status: 400 });
  // Never trust supplied differences or prose. Compute all numeric output server-side.
  const facts: TeamComparison = {
    monthKey: payload.monthKey!, period: `${payload.monthKey!.slice(0, 4)} оны ${Number(payload.monthKey!.slice(5))}-р сарын дүгнэлт`,
    cx: payload.cx, dev: payload.dev,
    difference: { bug: payload.cx.bug - payload.dev.bug, imp: payload.cx.imp - payload.dev.imp },
    partial: Boolean(payload.partial), cxSyncedAt: "", devSyncedAt: "",
  };
  const local = () => Response.json({ summary: comparisonSummary(facts), source: "local" });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return local();
  try {
    const defaultModel = "openai/gpt-oss-120b";
    const models = Array.from(new Set([process.env.GROQ_MODEL || defaultModel, defaultModel]));
    const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const signal = AbortSignal.timeout(20_000);
    for (const model of models) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.1, max_completion_tokens: 900, ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}), response_format: { type: "json_object" }, messages: [{ role: "user", content: `Монгол хэлний тайлангийн редакторын хувьд зөвхөн энэ оршлыг нэг өгүүлбэрээр найруул. Шинэ баримт, тоо, шалтгаан, зөрүү, зөвлөмж бүү нэм. CX, Технологийн, IMP, гүйцэтгэсэн, харьцуул гэсэн утгыг хадгал. Зөвхөн {"introduction":"..."} JSON буцаа.\n${COMPARISON_INTRO}` }] }),
      });
      // A retired configured model must not silently disable AI forever.
      if (response.status === 404) continue;
      if (!response.ok) return local();
      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = (result.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
      const candidate = (JSON.parse(text) as { introduction?: unknown }).introduction;
      const introduction = verifiedComparisonIntroduction(candidate);
      const accepted = typeof candidate === "string" && introduction === candidate.trim();
      return Response.json({ summary: comparisonSummary(facts, introduction), source: accepted ? "groq" : "local" });
    }
    return local();
  } catch { return local(); }
}
