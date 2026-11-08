import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../db/test-db.js";
import { usage } from "../db/schema.js";
import { demoBudgetFetch, reservationMicroUsd, reserveDemoBudget } from "./demo-budget.js";

let db: TestDb;
vi.mock("../db/index.js", () => ({ getDb: () => db.testDb }));
const owner = "recording@example.com";
const endpoint = "https://api.deepseek.com/v1/chat/completions";
const payload = { model: "deepseek-flash", messages: [{ role: "user", content: "Read the selected public record." }], max_tokens: 64000, stream: true };
const request = (extra = {}) => ({ method: "POST", body: JSON.stringify({ ...payload, ...extra }) });

beforeAll(async () => { db = await createTestDb(); });
beforeEach(async () => {
  await db.testDb.delete(usage);
  vi.stubEnv("REDSTRING_DEMO_OWNER_EMAIL", owner);
  vi.stubEnv("REDSTRING_DEMO_BUDGET_ID", "recording-20261107");
  vi.stubEnv("REDSTRING_DEMO_BUDGET_MICRO_USD", "1000000");
  vi.stubEnv("REDSTRING_DEMO_EXPIRES_AT", new Date(Date.now() + 60000).toISOString());
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await db.client.close(); });

describe("temporary demo provider allowance", () => {
  it("reserves atomically so parallel calls cannot overspend the same allowance", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveDemoBudget(owner, "same-session", 100, 40)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
    const rows = await db.testDb.select().from(usage);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(80);
  });

  it("caps output and thinking before forwarding and preserves a streaming response", async () => {
    const stream = new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
    let forwarded: Record<string, unknown> | undefined;
    const upstream = vi.fn(async (input: RequestInfo | URL) => {
      forwarded = await (input as Request).json();
      return stream;
    });
    const response = await demoBudgetFetch(upstream, owner)(endpoint, request());
    expect(response).toBe(stream);
    expect(forwarded?.max_tokens).toBe(4096);
    expect(forwarded?.thinking).toEqual({ type: "disabled" });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const rows = await db.testDb.select().from(usage);
    expect(rows[0]?.count).toBe(reservationMicroUsd(Buffer.byteLength(JSON.stringify(forwarded))));
  });

  it.each([undefined, "someone-else@example.com"])("refuses unverified or other owners (%s) before provider access", async identity => {
    const upstream = vi.fn();
    await expect(demoBudgetFetch(upstream, identity)(endpoint, request())).rejects.toThrow("paused");
    expect(upstream).not.toHaveBeenCalled();
    expect(await db.testDb.select().from(usage)).toHaveLength(0);
  });

  it.each(["0", "1000001", "NaN", "1.5"])("fails closed for an invalid operator allowance (%s)", async limit => {
    vi.stubEnv("REDSTRING_DEMO_BUDGET_MICRO_USD", limit);
    const upstream = vi.fn();
    await expect(demoBudgetFetch(upstream, owner)(endpoint, request())).rejects.toThrow("paused");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses expired windows and the kill switch, including title-sized requests", async () => {
    const upstream = vi.fn();
    vi.stubEnv("REDSTRING_DEMO_EXPIRES_AT", "2020-01-01T00:00:00Z");
    await expect(demoBudgetFetch(upstream, owner)(endpoint, request({ max_tokens: 20 }))).rejects.toThrow("paused");
    vi.stubEnv("REDSTRING_DEMO_EXPIRES_AT", new Date(Date.now() + 60000).toISOString());
    vi.stubEnv("REDSTRING_KILL_SWITCH", "1");
    await expect(demoBudgetFetch(upstream, owner)(endpoint, request({ max_tokens: 20 }))).rejects.toThrow("Daily limit");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["https://other.example/v1/chat/completions", {}],
    ["https://api.deepseek.com/v1/responses", {}],
    [endpoint, { model: "deepseek-v4-pro" }],
    [endpoint, { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }] }],
    [endpoint, { messages: [{ role: "user", content: "x".repeat(256001) }] }],
  ])("refuses unpriced endpoints/models/media/oversized requests", async (url, extra) => {
    const upstream = vi.fn();
    await expect(demoBudgetFetch(upstream, owner)(url as string, request(extra))).rejects.toThrow("paused");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("retains the reservation after a failed request and stops before the next one", async () => {
    const normalized = { ...payload, max_tokens: 4096, thinking: { type: "disabled" } };
    const amount = reservationMicroUsd(Buffer.byteLength(JSON.stringify(normalized)));
    vi.stubEnv("REDSTRING_DEMO_BUDGET_MICRO_USD", String(amount));
    const upstream = vi.fn(async () => { throw new Error("provider unavailable"); });
    const fetcher = demoBudgetFetch(upstream, owner);
    await expect(fetcher(endpoint, request())).rejects.toThrow("provider unavailable");
    await expect(fetcher(endpoint, request())).rejects.toThrow("exhausted");
    expect(upstream).toHaveBeenCalledTimes(1);
    const rows = await db.testDb.select().from(usage).where(eq(usage.ownerEmail, owner));
    expect(rows[0]?.count).toBe(amount);
  });

  it("leaves ordinary operation unchanged when no demo settings are present", async () => {
    for (const name of ["OWNER_EMAIL", "BUDGET_ID", "BUDGET_MICRO_USD", "EXPIRES_AT"]) vi.stubEnv("REDSTRING_DEMO_" + name, "");
    const upstream = vi.fn(async () => new Response("ordinary"));
    expect(await (await demoBudgetFetch(upstream, undefined)(endpoint, request())).text()).toBe("ordinary");
    expect(await db.testDb.select().from(usage)).toHaveLength(0);
  });
});
