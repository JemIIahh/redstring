// Endpoints (documented by the SEC; NOT yet verified live, because every
// request needs a declared contact in the User-Agent and that is the owner's
// `REDSTRING_SEC_USER_AGENT`, which has not been provided):
//   GET https://www.sec.gov/files/company_tickers.json
//        -> {"0":{cik_str,ticker,title},...}  (registrants that have a ticker)
//   GET https://data.sec.gov/submissions/CIK##########.json
//        -> {cik,name,tickers,filings:{recent:{accessionNumber[],filingDate[],form[],primaryDocument[],primaryDocDescription[]}}}
//   Archive link: https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<primaryDocument>
// Limit: 10 requests a second.
import { createCache, type Cache } from "./cache.js";
import { contentHash } from "./hash.js";
import { fetchBody } from "./http.js";
import { createLimiter } from "./limiter.js";
import { SourceError, type Limiter, type SourceResult } from "./types.js";

const SOURCE = "sec";
const MAX_HITS = 10;
const DEFAULT_CAP = 50;

export interface SecFiler {
  cik: string;
  name: string;
  ticker: string;
}

export interface SecFiling {
  accession: string;
  date: string;
  form: string;
  description: string;
  url: string;
}

export interface SecClient {
  findCompany(name: string): Promise<SourceResult<SecFiler[]>>;
  recentFilings(cik: string, o?: { cap?: number }): Promise<SourceResult<SecFiling[]>>;
}

const pad = (cik: string | number) => String(cik).replace(/^0+/, "").padStart(10, "0");
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

export function createSecClient(o: {
  userAgent?: string | undefined;
  fetch?: typeof fetch;
  limiter?: Limiter;
  cache?: Cache;
  timeoutMs?: number;
}): SecClient {
  const doFetch = o.fetch ?? fetch;
  const limiter = o.limiter ?? createLimiter({ max: 10, windowMs: 1000 });
  const cache = o.cache ?? createCache(60 * 60_000);
  const timeoutMs = o.timeoutMs ?? 15_000;

  async function get(url: string) {
    if (!o.userAgent?.trim()) {
      throw new SourceError(
        SOURCE,
        "no_key",
        "SEC requests need a declared User-Agent with a contact; none is configured.",
      );
    }
    const cached = cache.get<{ body: unknown; retrievedAt: string }>(url);
    if (cached) return cached;
    if (!(await limiter.take())) {
      throw new SourceError(SOURCE, "rate_limited", "The SEC request budget is used up for a moment.");
    }
    const got = await fetchBody({
      source: SOURCE,
      fetch: doFetch,
      url,
      init: { headers: { "User-Agent": o.userAgent, Accept: "application/json" } },
      timeoutMs,
      refusedKind: "no_key",
      refusedMessage: "The SEC refused the declared User-Agent.",
    });
    cache.set(url, got);
    return got;
  }

  return {
    async findCompany(name) {
      const url = "https://www.sec.gov/files/company_tickers.json";
      const got = await get(url);
      const body = got.body as Record<string, any> | null;
      if (body === null || typeof body !== "object") {
        throw new SourceError(SOURCE, "bad_response", "SEC tickers file is not a record");
      }
      const want = tokens(name);
      const matches: SecFiler[] = [];
      if (want.length > 0) {
        for (const entry of Object.values(body)) {
          if (!entry || typeof entry !== "object" || entry.cik_str === undefined) continue;
          const title = String(entry.title ?? "");
          const have = tokens(title).join(" ");
          if (want.every((t) => have.includes(t))) {
            const cik = pad(entry.cik_str);
            const ticker = String(entry.ticker ?? "");
            // A registrant with several tickers is listed once, with all of them.
            const known = matches.find((m) => m.cik === cik);
            if (known) {
              if (ticker && !known.ticker.split(", ").includes(ticker)) {
                known.ticker = known.ticker ? `${known.ticker}, ${ticker}` : ticker;
              }
            } else {
              matches.push({ cik, name: title, ticker });
            }
          }
        }
      }
      const data = matches.slice(0, MAX_HITS);
      return {
        data,
        evidence: {
          source: SOURCE,
          url,
          recordId: `search:${name}`,
          retrievedAt: got.retrievedAt,
          contentHash: contentHash(body),
        },
        complete: matches.length <= MAX_HITS,
        ...(data.length === 0
          ? { note: "no SEC registrant with a ticker matches" }
          : matches.length > MAX_HITS
            ? { note: `showing ${MAX_HITS} of ${matches.length}` }
            : {}),
      };
    },

    async recentFilings(cik, opts) {
      const padded = pad(cik);
      const got = await get(`https://data.sec.gov/submissions/CIK${padded}.json`);
      const recent = (got.body as any)?.filings?.recent;
      const acc: unknown = recent?.accessionNumber;
      if (!Array.isArray(acc)) {
        throw new SourceError(SOURCE, "bad_response", "SEC submissions file has no recent filings list");
      }
      const cap = Math.max(1, opts?.cap ?? DEFAULT_CAP);
      const data: SecFiling[] = acc.slice(0, cap).map((a: string, i: number) => ({
        accession: a,
        date: String(recent.filingDate?.[i] ?? ""),
        form: String(recent.form?.[i] ?? ""),
        description: String(recent.primaryDocDescription?.[i] ?? ""),
        url: `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${a.replace(/-/g, "")}/${recent.primaryDocument?.[i] ?? ""}`,
      }));
      return {
        data,
        evidence: {
          source: SOURCE,
          url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}`,
          recordId: padded,
          retrievedAt: got.retrievedAt,
          contentHash: contentHash(got.body),
        },
        complete: acc.length <= cap,
        ...(acc.length > cap ? { note: `showing ${cap} of ${acc.length}` } : {}),
      };
    },
  };
}
