import { describe, expect, it } from "vitest";

import { createLimiter } from "./limiter.js";
import { createSecClient } from "./sec.js";
import { fakeFetch, fixture } from "./test-helpers.js";

const UA = "Redstring test contact@example.invalid";

function secFetch() {
  return fakeFetch((c) => {
    if (c.url.pathname === "/files/company_tickers.json") {
      return { body: fixture("sec/company-tickers.synthetic.json") };
    }
    if (c.url.pathname === "/submissions/CIK0001234567.json") {
      return { body: fixture("sec/submissions-0001234567.synthetic.json") };
    }
    return undefined;
  });
}

describe("SEC EDGAR client", () => {
  it("sends the declared user agent on every request", async () => {
    const { fetch, calls } = secFetch();
    const sec = createSecClient({ userAgent: UA, fetch });

    await sec.findCompany("example holdings");
    await sec.recentFilings("1234567");

    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.headers["User-Agent"] === UA)).toBe(true);
  });

  it("without a user agent it throws no_key and does not call fetch", async () => {
    const { fetch, fn } = secFetch();
    const sec = createSecClient({ fetch });

    await expect(sec.findCompany("x")).rejects.toMatchObject({
      source: "sec",
      kind: "no_key",
    });
    await expect(sec.recentFilings("1")).rejects.toMatchObject({ kind: "no_key" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("finds registrants by name, ignoring case, with zero-padded CIK", async () => {
    const { fetch } = secFetch();

    const result = await createSecClient({ userAgent: UA, fetch }).findCompany(
      "EXAMPLE holdings",
    );

    expect(result.data.map((f) => [f.cik, f.name, f.ticker])).toEqual([
      ["0001234567", "Example Holdings Inc.", "EXMP"],
      ["0007654321", "EXAMPLE HOLDINGS ACQUISITION CORP", "EXMQ"],
    ]);
    expect(result.evidence).toMatchObject({
      source: "sec",
      url: "https://www.sec.gov/files/company_tickers.json",
      recordId: "search:EXAMPLE holdings",
    });
    expect(result.complete).toBe(true);
  });

  it("no match is a normal null with a note about what is searched", async () => {
    const { fetch } = secFetch();

    const result = await createSecClient({ userAgent: UA, fetch }).findCompany(
      "zzz nothing",
    );

    expect(result.data).toEqual([]);
    expect(result.note).toBe("no SEC registrant with a ticker matches");
  });

  it("reads recent filings with their archive links", async () => {
    const { fetch, calls } = secFetch();

    const result = await createSecClient({ userAgent: UA, fetch }).recentFilings("0001234567");

    expect(calls[0]?.url.toString()).toBe(
      "https://data.sec.gov/submissions/CIK0001234567.json",
    );
    expect(result.data).toEqual([
      {
        accession: "0001234567-26-000012",
        date: "2026-10-30",
        form: "8-K",
        description: "CURRENT REPORT",
        url: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000012/exmp-8k.htm",
      },
      {
        accession: "0001234567-26-000003",
        date: "2026-08-01",
        form: "10-Q",
        description: "QUARTERLY REPORT",
        url: "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000003/exmp-10q.htm",
      },
    ]);
    expect(result.evidence).toMatchObject({
      source: "sec",
      recordId: "0001234567",
      url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001234567",
    });
  });

  it("a refused limiter throws rate_limited without calling fetch", async () => {
    const { fetch, fn } = secFetch();
    const sec = createSecClient({
      userAgent: UA,
      fetch,
      limiter: createLimiter({ max: 0, windowMs: 1000 }),
    });
    await expect(sec.findCompany("x")).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps 403 (user agent refused) to no_key and 429 to rate_limited", async () => {
    const forbidden = fakeFetch(() => ({ status: 403 }));
    await expect(
      createSecClient({ userAgent: UA, fetch: forbidden.fetch }).findCompany("x"),
    ).rejects.toMatchObject({ kind: "no_key" });
    const limited = fakeFetch(() => ({ status: 429 }));
    await expect(
      createSecClient({ userAgent: UA, fetch: limited.fetch }).recentFilings("1"),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });
});
