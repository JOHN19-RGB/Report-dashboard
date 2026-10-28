// Cache of verified AI (Groq) summary text in Supabase (table `ai_summaries`).
// Keyed by a SHA-256 of the summary kind, the model list and the exact prompt, so the same report gets the same
// wording without another model call, and editing a prompt or switching models naturally starts a fresh entry.
// Only text that passed the route's own verification is stored; local fallbacks are never cached.
import { supabaseConfig, supabaseSelect, supabaseUpsert } from "./supabase";

const TABLE = "ai_summaries";
const TIMEOUT_MS = 3_000;

export async function aiCacheKey(kind: string, parts: string[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([kind, ...parts])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Cached text, or null when missing, Supabase isn't configured, or the lookup fails (callers then ask the model). */
export async function readAiText(key: string) {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    const [row] = await supabaseSelect<{ text: string }>(config, `${TABLE}?select=text&key=eq.${key}`, TIMEOUT_MS);
    return typeof row?.text === "string" ? row.text : null;
  } catch (error) {
    console.error("AI summary cache read failed", error);
    return null;
  }
}

export async function saveAiText(key: string, kind: string, model: string, text: string) {
  const config = supabaseConfig();
  if (!config) return;
  try {
    await supabaseUpsert(config, TABLE, { key, kind, model, text, created_at: new Date().toISOString() }, "key", TIMEOUT_MS);
  } catch (error) {
    console.error("AI summary cache write failed", error);
  }
}
