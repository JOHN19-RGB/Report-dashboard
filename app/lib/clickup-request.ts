export function clickUpRetryDelay(response: Response, attempt: number, now = Date.now()) {
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 || Date.parse(retryAfter) - now : 0;
  const reset = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
  const resetMs = reset > now ? reset - now + 500 : 0;
  return Math.min(65_000, Math.max(1000 * 2 ** attempt, retryAfterMs || 0, resetMs));
}

/** ClickUp allows 100 requests per minute per token; every route on this instance shares the budget. */
const RATE_LIMIT_RESERVE = 3;
let rateLimitPausedUntil = 0;

export function noteClickUpRateLimit(response: Response, now = Date.now()) {
  const remainingHeader = response.headers.get("X-RateLimit-Remaining");
  const remaining = remainingHeader === null ? NaN : Number(remainingHeader);
  const reset = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
  if (Number.isFinite(remaining) && remaining <= RATE_LIMIT_RESERVE && reset > now) {
    rateLimitPausedUntil = Math.max(rateLimitPausedUntil, Math.min(reset + 500, now + 65_000));
  }
}

export function clickUpRateLimitWait(now = Date.now()) {
  return Math.max(0, rateLimitPausedUntil - now);
}

export async function requestClickUp(
  path: string,
  token: string,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  { timeoutMs = 25_000, attempts = 4, rateLimitAttempts = 6 } = {},
) {
  let failures = 0;
  let rateLimited = 0;
  for (let attempt = 0; ; attempt += 1) {
    const paused = clickUpRateLimitWait();
    if (paused) await wait(paused);
    let response: Response;
    try {
      response = await fetcher(`https://api.clickup.com/api/v2${path}`, {
        headers: { Authorization: token, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      failures += 1;
      if (failures >= attempts) throw error;
      await wait(1000 * 2 ** (failures - 1));
      continue;
    }
    if (response.status === 429) {
      rateLimited += 1;
      if (rateLimited >= rateLimitAttempts) return response;
      await response.body?.cancel();
      // Pause every caller on this instance, not just this request, until the window resets.
      rateLimitPausedUntil = Math.max(rateLimitPausedUntil, Date.now() + clickUpRetryDelay(response, rateLimited - 1));
      continue;
    }
    noteClickUpRateLimit(response);
    if (![502, 503, 504].includes(response.status)) return response;
    failures += 1;
    if (failures >= attempts) return response;
    await response.body?.cancel();
    await wait(1000 * 2 ** (failures - 1));
  }
}
