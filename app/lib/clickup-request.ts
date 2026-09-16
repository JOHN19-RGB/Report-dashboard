export function clickUpRetryDelay(response: Response, attempt: number, now = Date.now()) {
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 || Date.parse(retryAfter) - now : 0;
  const reset = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
  const resetMs = reset > now ? reset - now + 500 : 0;
  return Math.min(65_000, Math.max(1000 * 2 ** attempt, retryAfterMs || 0, resetMs));
}

export async function requestClickUp(
  path: string,
  token: string,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
) {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(`https://api.clickup.com/api/v2${path}`, {
        headers: { Authorization: token, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      if (attempt >= 3) throw error;
      await wait(1000 * 2 ** attempt);
      continue;
    }
    const retryable = response.status === 429 || [502, 503, 504].includes(response.status);
    if (!retryable || attempt >= 3) return response;
    const delay = response.status === 429 ? clickUpRetryDelay(response, attempt) : 1000 * 2 ** attempt;
    await response.body?.cancel();
    await wait(delay);
  }
}
