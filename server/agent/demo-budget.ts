import { randomUUID } from "node:crypto";
import { lte, sql } from "drizzle-orm";
import { settings } from "../config.js";
import { getDb } from "../db/index.js";
import { usage } from "../db/schema.js";
import { assertKillSwitchOff } from "../usage/caps.js";

const stopped = () => new Error("Demo AI access is paused or its recording allowance is exhausted.");
const MAX_OUTPUT = 4096;

/** Reserve against peak Flash rates ($0.30/M input, $1.20/M output).
 * Text-only payload bytes are deliberately overcounted, including tool schemas,
 * with double-byte allowance plus framing overhead. No cache discount is assumed.
 * Reservations are never refunded, including failed/retried calls: a conservative
 * request allowance, not an assertion about the provider's final invoice.
 */
export function reservationMicroUsd(bodyBytes: number): number {
  return Math.ceil((bodyBytes * 2 + 8192) * 0.3 + MAX_OUTPUT * 1.2);
}

export async function reserveDemoBudget(owner: string, bucket: string, limit: number, amount: number) {
  if (amount > limit || amount <= 0) throw stopped();
  const rows = await getDb().insert(usage).values({
    id: randomUUID(), ownerEmail: owner, kind: "demo-model-micro-usd", bucket, count: amount,
  }).onConflictDoUpdate({
    target: [usage.ownerEmail, usage.kind, usage.bucket],
    set: { count: sql`${usage.count} + ${amount}` },
    setWhere: lte(usage.count, limit - amount),
  }).returning({ count: usage.count });
  if (!rows.length) throw stopped();
}

/** Covers every use of the OpenAI-compatible engine, including automatic titles.
 * Capture the verified request owner when the framework creates the engine;
 * never obtain identity from an environment variable or caller-provided body.
 */
export function demoBudgetFetch(upstream: typeof fetch, owner: string | undefined): typeof fetch {
  return async (input, init) => {
    const configured = [settings.demoOwner(), settings.demoBudgetId(), settings.demoBudgetMicroUsd(), settings.demoExpiresAt()];
    if (configured.every(v => !v)) return upstream(input, init);
    const [allowedOwner, budgetId, rawLimit, expires] = configured;
    const limit = Number(rawLimit);
    if (!owner || owner !== allowedOwner || !budgetId || !/^[a-zA-Z0-9_-]{1,80}$/.test(budgetId)
      || !rawLimit || !/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1_000_000
      || !expires || !Number.isFinite(Date.parse(expires)) || Date.now() >= Date.parse(expires)) throw stopped();
    await assertKillSwitchOff();
    const request = new Request(input, init);
    const endpoint = new URL(request.url);
    if (endpoint.origin !== "https://api.deepseek.com" || endpoint.pathname !== "/v1/chat/completions"
      || request.method !== "POST") throw stopped();
    const original = await request.text();
    if (Buffer.byteLength(original) > 256_000) throw stopped();
    let body: Record<string, unknown>;
    try { body = JSON.parse(original); } catch { throw stopped(); }
    // Only text/tool conversations on the priced model are included in this allowance.
    if (!body || body.model !== "deepseek-flash" || !Array.isArray(body.messages)
      || /"(?:image_url|input_audio|video_url|file_data)"\s*:/.test(original)) throw stopped();
    if (body.tools !== undefined && (!Array.isArray(body.tools)
      || body.tools.some((tool: { type?: unknown }) => !tool || tool.type !== "function"))) throw stopped();
    const requested = Number(body.max_tokens ?? body.max_completion_tokens ?? MAX_OUTPUT);
    if (!Number.isFinite(requested) || requested <= 0) throw stopped();
    delete body.max_completion_tokens;
    body.max_tokens = Math.min(MAX_OUTPUT, Math.floor(requested));
    body.thinking = { type: "disabled" };
    const encoded = JSON.stringify(body);
    await reserveDemoBudget(owner, budgetId, limit, reservationMicroUsd(Buffer.byteLength(encoded)));
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    // Preserve the framework's credential/endpoint validation, abort signal and SSE response.
    return upstream(new Request(request.url, {
      method: "POST", headers, body: encoded, signal: request.signal, redirect: "error",
    }));
  };
}
