import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createCache } from "./cache.js";
import { createChClient } from "./companies-house.js";
import { contentHash } from "./hash.js";
import { createLimiter } from "./limiter.js";
import { SourceError } from "./types.js";

const BASE = "https://api.company-information.service.gov.uk";
const PUBLIC = "https://find-and-update.company-information.service.gov.uk";

function fixture(name: string): any {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/ch/${name}.json`, import.meta.url), "utf8"),
  );
}

type Reply = { status?: number; body?: unknown };

function fakeFetch(handler: (url: URL) => Reply | undefined) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const reply = handler(url) ?? { status: 404, body: { error: "not found" } };
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

function client(
  handler: (url: URL) => Reply | undefined,
  extra: Partial<Parameters<typeof createChClient>[0]> = {},
) {
  const f = fakeFetch(handler);
  const ch = createChClient({ apiKey: "test-key", fetch: f.fetch, ...extra });
  return { ch, ...f };
}

describe("Companies House client: requests", () => {
  it("sends basic auth with the key and an empty password", async () => {
    const { ch, calls } = client(() => ({ body: fixture("company-OC000001") }));

    await ch.getCompany("OC000001");

    const expected = `Basic ${Buffer.from("test-key:").toString("base64")}`;
    expect(calls[0]?.headers.Authorization).toBe(expected);
    expect(calls[0]?.url.origin).toBe(BASE);
    expect(calls[0]?.url.pathname).toBe("/company/OC000001");
  });

  it("no key throws no_key and does not call fetch", async () => {
    const f = fakeFetch(() => ({ body: {} }));
    const ch = createChClient({ fetch: f.fetch });

    await expect(ch.getCompany("OC000001")).rejects.toMatchObject({
      name: "SourceError",
      kind: "no_key",
    });
    expect(f.fn).not.toHaveBeenCalled();
  });

  it("maps 429 to rate_limited and does not retry", async () => {
    const { ch, fn } = client(() => ({ status: 429, body: {} }));

    await expect(ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maps 404 to not_found", async () => {
    const { ch } = client(() => ({ status: 404, body: {} }));
    await expect(ch.getCompany("OC999999")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("maps 401 to no_key (the key was refused)", async () => {
    const { ch } = client(() => ({ status: 401, body: {} }));
    await expect(ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "no_key",
    });
  });

  it("maps a server error or a non-JSON body to bad_response", async () => {
    const down = client(() => ({ status: 503, body: {} }));
    await expect(down.ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "bad_response",
    });

    const junk = createChClient({
      apiKey: "k",
      fetch: (async () => new Response("<html>oops</html>", { status: 200 })) as typeof fetch,
    });
    await expect(junk.getCompany("OC000001")).rejects.toMatchObject({
      kind: "bad_response",
    });
  });

  it("maps an aborted request to timeout", async () => {
    const ch = createChClient({
      apiKey: "k",
      timeoutMs: 5,
      fetch: ((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        })) as unknown as typeof fetch,
    });
    await expect(ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("a refused limiter throws rate_limited without calling fetch", async () => {
    const limiter = createLimiter({ max: 0, windowMs: 1000 });
    const { ch, fn } = client(() => ({ body: fixture("company-OC000001") }), {
      limiter,
    });

    await expect(ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("answers a repeated request from the cache without using the limiter", async () => {
    let t = 0;
    const limiter = createLimiter({ max: 1, windowMs: 60_000, now: () => t });
    const { ch, fn } = client(() => ({ body: fixture("company-OC000001") }), {
      limiter,
      cache: createCache(600_000, () => t),
    });

    const first = await ch.getCompany("OC000001");
    t = 1000;
    const second = await ch.getCompany("OC000001");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(second.data).toEqual(first.data);
    // The evidence keeps the time the record was really fetched.
    expect(second.evidence.retrievedAt).toBe(first.evidence.retrievedAt);
  });
});

describe("Companies House client: results", () => {
  it("returns evidence with the public url, the record id and a stable hash", async () => {
    const body = fixture("company-OC000001");
    const { ch } = client(() => ({ body }));

    const result = await ch.getCompany("OC000001");

    expect(result.evidence).toMatchObject({
      source: "companies-house",
      url: `${PUBLIC}/company/OC000001`,
      recordId: "OC000001",
      contentHash: contentHash(body),
    });
    expect(Number.isNaN(Date.parse(result.evidence.retrievedAt))).toBe(false);
    expect(result.complete).toBe(true);
  });

  it("maps a company profile", async () => {
    const { ch } = client(() => ({ body: fixture("company-LP000001") }));

    const { data } = await ch.getCompany("LP000001");

    expect(data).toEqual({
      number: "LP000001",
      name: "EXAMPLE PARTNERS LP",
      status: "dissolved",
      type: "limited-partnership",
      createdOn: "2009-03-03",
      ceasedOn: "2013-04-04",
      address: "2 Sample Lane, Sampleford, SA2 2BB",
    });
  });

  it("maps search hits", async () => {
    const { ch, calls } = client(() => ({ body: fixture("search-companies") }));

    const { data, evidence } = await ch.searchCompanies("example holdings");

    expect(calls[0]?.url.pathname).toBe("/search/companies");
    expect(calls[0]?.url.searchParams.get("q")).toBe("example holdings");
    expect(data.map((h) => [h.number, h.status])).toEqual([
      ["OC000001", "active"],
      ["OC000002", "dissolved"],
      ["00000003", "active"],
    ]);
    expect(evidence.recordId).toBe("search:example holdings");
  });

  it("keeps two officers with the same name apart by officer id", async () => {
    const { ch } = client(() => ({ body: fixture("officers-OC000001") }));

    const { data } = await ch.getOfficers("OC000001");

    const smiths = data.filter((o) => o.name === "SMITH, John");
    expect(smiths).toHaveLength(2);
    expect(new Set(smiths.map((o) => o.officerId)).size).toBe(2);
    expect(smiths[0]).toMatchObject({
      officerId: "EXOFFICERID00000000000000000002",
      role: "llp-designated-member",
      appointedOn: "2011-03-01",
      nationality: "British",
      birth: { month: 4, year: 1970 },
      corporate: false,
    });
    expect(data[0]).toMatchObject({ corporate: true, name: "EXAMPLE MEMBER ONE LTD" });
  });

  it("caps officers at 50 and says \"showing 50 of N\"", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      name: `PERSON ${i}`,
      officer_role: "director",
      links: { officer: { appointments: `/officers/ID${i}/appointments` } },
    }));
    const { ch, calls } = client(() => ({
      body: { total_results: 200, items_per_page: 50, items },
    }));

    const result = await ch.getOfficers("OC000001");

    expect(calls[0]?.url.searchParams.get("items_per_page")).toBe("50");
    expect(result.data).toHaveLength(50);
    expect(result.complete).toBe(false);
    expect(result.note).toBe("showing 50 of 200");
  });

  it("an officer list that fits is complete with no note", async () => {
    const { ch } = client(() => ({ body: fixture("officers-OC000001") }));
    const result = await ch.getOfficers("OC000001");
    expect(result.complete).toBe(true);
    expect(result.note).toBeUndefined();
  });

  it("an officer with no id in the response is a bad_response, never a guess", async () => {
    const { ch } = client(() => ({
      body: { total_results: 1, items: [{ name: "NO ID", officer_role: "director" }] },
    }));
    await expect(ch.getOfficers("OC000001")).rejects.toMatchObject({
      kind: "bad_response",
    });
  });

  it("maps persons with significant control", async () => {
    const { ch } = client(() => ({ body: fixture("pscs-OC000001") }));

    const { data, evidence } = await ch.getControllers("OC000001");

    expect(data).toEqual([
      {
        id: "EXPSCID0000000000000000000001",
        name: "EXAMPLE MEMBER ONE LTD",
        kind: "corporate-entity-person-with-significant-control",
        notifiedOn: "2016-04-06",
        natures: ["right-to-share-surplus-assets-75-to-100-percent-as-firm"],
      },
    ]);
    expect(evidence.url).toBe(
      `${PUBLIC}/company/OC000001/persons-with-significant-control`,
    );
  });

  it("maps filings and caps them", async () => {
    const { ch, calls } = client(() => ({ body: fixture("filings-OC000001") }));

    const { data, complete } = await ch.getFilings("OC000001", { cap: 25 });

    expect(calls[0]?.url.searchParams.get("items_per_page")).toBe("25");
    expect(data.map((f) => f.transactionId)).toEqual([
      "EXTXN0000000000000001",
      "EXTXN0000000000000002",
    ]);
    expect(data[0]).toMatchObject({ date: "2013-02-01", category: "accounts", type: "AA" });
    expect(complete).toBe(true);
  });

  it("maps an officer's other appointments", async () => {
    const { ch, calls } = client(() => ({
      body: fixture("appointments-EXOFFICERID00000000000000000002"),
    }));

    const { data, evidence } = await ch.getAppointments(
      "EXOFFICERID00000000000000000002",
    );

    expect(calls[0]?.url.pathname).toBe(
      "/officers/EXOFFICERID00000000000000000002/appointments",
    );
    expect(data).toHaveLength(2);
    expect(data[1]).toEqual({
      companyNumber: "00000003",
      companyName: "EXAMPLE HOLDINGS LIMITED",
      companyStatus: "active",
      role: "director",
      appointedOn: "2015-01-01",
      resignedOn: "2016-01-01",
    });
    expect(evidence.recordId).toBe("EXOFFICERID00000000000000000002");
    expect(evidence.url).toBe(
      `${PUBLIC}/officers/EXOFFICERID00000000000000000002/appointments`,
    );
  });

  it("finds companies by registered-office location", async () => {
    const { ch, calls } = client(() => ({
      body: fixture("advanced-search-location"),
    }));

    const { data, complete } = await ch.searchByLocation("1 Example Street", {
      cap: 50,
    });

    expect(calls[0]?.url.pathname).toBe("/advanced-search/companies");
    expect(calls[0]?.url.searchParams.get("location")).toBe("1 Example Street");
    expect(calls[0]?.url.searchParams.get("size")).toBe("50");
    expect(data.map((h) => h.number)).toEqual(["OC000001", "OC000009"]);
    expect(complete).toBe(true);
  });

  it("a SourceError names its source", async () => {
    const { ch } = client(() => ({ status: 429, body: {} }));
    const err = await ch.getCompany("OC000001").catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.source).toBe("companies-house");
  });
});

// Live smoke test: runs only when a real key is present.
describe.skipIf(!process.env.COMPANIES_HOUSE_API_KEY)("Companies House live", () => {
  it("fetches LCM Alliance LLP", async () => {
    const ch = createChClient({ apiKey: process.env.COMPANIES_HOUSE_API_KEY });
    const { data } = await ch.getCompany("OC372263");
    expect(data.name).toContain("LCM");
  });
});
