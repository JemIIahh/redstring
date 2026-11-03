import { SourceError, type SourceErrorKind } from "./types.js";

/**
 * One GET or POST to a public source with a timeout and a plain mapping from
 * HTTP trouble to `SourceError` kinds. 429 is never retried.
 */
export async function fetchBody(o: {
  source: string;
  fetch: typeof fetch;
  url: string;
  init?: RequestInit;
  timeoutMs: number;
  /** What a 401 or 403 means for this source; without it they are a bad_response. */
  refusedKind?: SourceErrorKind;
  refusedMessage?: string;
}): Promise<{ body: unknown; retrievedAt: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  let status: number;
  let text: string;
  try {
    const res = await o.fetch(o.url, { ...o.init, signal: controller.signal });
    status = res.status;
    text = await res.text();
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new SourceError(o.source, "timeout", `${o.source} did not answer in time.`);
    }
    throw new SourceError(
      o.source,
      "bad_response",
      `could not reach ${o.source}: ${(e as Error)?.message ?? e}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (status === 429) {
    throw new SourceError(o.source, "rate_limited", `${o.source} says too many requests.`);
  }
  if (status === 404) {
    throw new SourceError(o.source, "not_found", `${o.source} has no such record.`);
  }
  if ((status === 401 || status === 403) && o.refusedKind) {
    throw new SourceError(
      o.source,
      o.refusedKind,
      o.refusedMessage ?? `${o.source} refused the request.`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new SourceError(o.source, "bad_response", `${o.source} answered ${status}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SourceError(
      o.source,
      "bad_response",
      `${o.source} answered with something that is not JSON`,
    );
  }
  return { body, retrievedAt: new Date().toISOString() };
}
