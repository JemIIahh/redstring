import type { EvidenceInput } from "../board/types.js";
import { createCache, type Cache } from "./cache.js";
import { contentHash } from "./hash.js";
import { createLimiter } from "./limiter.js";
import { SourceError, type Limiter, type SourceResult } from "./types.js";

const SOURCE = "companies-house";
const API = "https://api.company-information.service.gov.uk";
const PUBLIC = "https://find-and-update.company-information.service.gov.uk";
const DEFAULT_CAP = 50;
const MAX_PAGE = 100;

export interface CompanyHit {
  number: string;
  name: string;
  status?: string;
  type?: string;
  createdOn?: string;
  ceasedOn?: string;
  address?: string;
}

export interface CompanyProfile {
  number: string;
  name: string;
  status: string;
  type: string;
  createdOn?: string;
  ceasedOn?: string;
  address: string;
}

export interface Officer {
  /** The register's officer id: the only safe key for a person. Never the name. */
  officerId: string;
  name: string;
  role: string;
  appointedOn?: string;
  resignedOn?: string;
  nationality?: string;
  /** Month and year of birth, only for telling same-name people apart. */
  birth?: { month: number; year: number };
  /** True when the officer is itself a company. */
  corporate: boolean;
}

export interface Controller {
  id: string;
  name: string;
  kind: string;
  notifiedOn?: string;
  ceasedOn?: string;
  natures: string[];
}

export interface Filing {
  transactionId: string;
  date: string;
  category: string;
  type: string;
  description: string;
}

export interface Appointment {
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  role: string;
  appointedOn?: string;
  resignedOn?: string;
}

export interface ChClient {
  searchCompanies(q: string): Promise<SourceResult<CompanyHit[]>>;
  getCompany(n: string): Promise<SourceResult<CompanyProfile>>;
  getOfficers(n: string, o?: { cap?: number }): Promise<SourceResult<Officer[]>>;
  getControllers(n: string): Promise<SourceResult<Controller[]>>;
  getFilings(n: string, o?: { cap?: number }): Promise<SourceResult<Filing[]>>;
  getAppointments(
    officerId: string,
    o?: { cap?: number },
  ): Promise<SourceResult<Appointment[]>>;
  searchByLocation(
    q: string,
    o?: { cap?: number },
  ): Promise<SourceResult<CompanyHit[]>>;
}

type Json = Record<string, any>;

const opt = <K extends string, V>(key: K, value: V | null | undefined) =>
  value === undefined || value === null || value === ""
    ? {}
    : ({ [key]: value } as Record<K, V>);

function formatAddress(a: Json | undefined): string {
  if (!a) return "";
  return [
    a.premises,
    a.address_line_1,
    a.address_line_2,
    a.locality,
    a.region,
    a.postal_code,
  ]
    .filter((p) => typeof p === "string" && p.trim() !== "")
    .join(", ");
}

function bad(message: string): SourceError {
  return new SourceError(SOURCE, "bad_response", message);
}

/** The `items` array of a list response. Missing items are only fine when the total says zero. */
function itemsOf(body: unknown, total: number | undefined): Json[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Companies House returned something that is not a record");
  }
  const items = (body as Json).items;
  if (items === undefined) {
    if ((total ?? 0) === 0) return [];
    throw bad("Companies House list response has no items");
  }
  if (!Array.isArray(items)) throw bad("Companies House items is not a list");
  return items as Json[];
}

function lastSegment(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export function createChClient(o: {
  apiKey?: string | undefined;
  fetch?: typeof fetch;
  limiter?: Limiter;
  cache?: Cache;
  timeoutMs?: number;
}): ChClient {
  const doFetch = o.fetch ?? fetch;
  const limiter = o.limiter ?? createLimiter({ max: 500, windowMs: 5 * 60_000 });
  const cache = o.cache ?? createCache(10 * 60_000);
  const timeoutMs = o.timeoutMs ?? 10_000;

  async function get(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<{ body: unknown; retrievedAt: string }> {
    if (!o.apiKey) {
      throw new SourceError(
        SOURCE,
        "no_key",
        "A Companies House API key is not configured.",
      );
    }
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const cacheKey = url.toString();

    const cached = cache.get<{ body: unknown; retrievedAt: string }>(cacheKey);
    if (cached) return cached;

    if (!(await limiter.take())) {
      throw new SourceError(
        SOURCE,
        "rate_limited",
        "The Companies House request budget is used up for now.",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number;
    let text: string;
    try {
      const res = await doFetch(cacheKey, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${o.apiKey}:`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new SourceError(SOURCE, "timeout", "Companies House did not answer in time.");
      }
      throw bad(`could not reach Companies House: ${(e as Error)?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }

    if (status === 429) {
      throw new SourceError(SOURCE, "rate_limited", "Companies House says too many requests.");
    }
    if (status === 404) {
      throw new SourceError(SOURCE, "not_found", "Companies House has no such record.");
    }
    if (status === 401 || status === 403) {
      throw new SourceError(SOURCE, "no_key", "Companies House refused the API key.");
    }
    if (status < 200 || status >= 300) throw bad(`Companies House answered ${status}`);

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw bad("Companies House answered with something that is not JSON");
    }
    const entry = { body, retrievedAt: new Date().toISOString() };
    cache.set(cacheKey, entry);
    return entry;
  }

  const evidence = (
    url: string,
    recordId: string,
    got: { body: unknown; retrievedAt: string },
  ): EvidenceInput => ({
    source: SOURCE,
    url,
    recordId,
    retrievedAt: got.retrievedAt,
    contentHash: contentHash(got.body),
  });

  const capOf = (c?: number) => Math.max(1, c ?? DEFAULT_CAP);

  function listResult<T>(
    data: T[],
    total: number,
    ev: EvidenceInput,
  ): SourceResult<T[]> {
    const complete = total <= data.length;
    return {
      data,
      evidence: ev,
      complete,
      total,
      ...(complete ? {} : { note: `showing ${data.length} of ${total}` }),
    };
  }

  const hitOf = (r: Json, nameKey: string): CompanyHit => ({
    number: String(r.company_number),
    name: String(r[nameKey] ?? ""),
    ...opt("status", r.company_status),
    ...opt("type", r.company_type),
    ...opt("createdOn", r.date_of_creation),
    ...opt("ceasedOn", r.date_of_cessation),
    ...opt(
      "address",
      r.address_snippet ?? (formatAddress(r.registered_office_address) || undefined),
    ),
  });

  return {
    async searchCompanies(q) {
      const got = await get("/search/companies", { q, items_per_page: 20 });
      const b = got.body as Json;
      const items = itemsOf(b, b?.total_results);
      return listResult(
        items.map((r) => hitOf(r, "title")),
        b?.total_results ?? items.length,
        evidence(
          `${PUBLIC}/search/companies?q=${encodeURIComponent(q)}`,
          `search:${q}`,
          got,
        ),
      );
    },

    async getCompany(n) {
      const got = await get(`/company/${encodeURIComponent(n)}`);
      const b = got.body as Json;
      if (b === null || typeof b !== "object" || !b.company_number) {
        throw bad("Companies House company response has no company number");
      }
      const data: CompanyProfile = {
        number: String(b.company_number),
        name: String(b.company_name ?? ""),
        status: String(b.company_status ?? ""),
        type: String(b.type ?? ""),
        ...opt("createdOn", b.date_of_creation),
        ...opt("ceasedOn", b.date_of_cessation),
        address: formatAddress(b.registered_office_address),
      };
      return {
        data,
        evidence: evidence(`${PUBLIC}/company/${n}`, n, got),
        complete: true,
      };
    },

    async getOfficers(n, opts) {
      const cap = capOf(opts?.cap);
      const got = await get(`/company/${encodeURIComponent(n)}/officers`, {
        items_per_page: Math.min(cap, MAX_PAGE),
      });
      const b = got.body as Json;
      const items = itemsOf(b, b?.total_results).slice(0, cap);
      const data = items.map((r): Officer => {
        const officerId = lastSegment(
          (r.links?.officer?.appointments as string | undefined)?.replace(
            /\/appointments\/?$/,
            "",
          ),
        );
        if (!officerId) throw bad("Companies House officer has no id");
        const dob = r.date_of_birth;
        return {
          officerId,
          name: String(r.name ?? ""),
          role: String(r.officer_role ?? ""),
          ...opt("appointedOn", r.appointed_on),
          ...opt("resignedOn", r.resigned_on),
          ...opt("nationality", r.nationality),
          ...(dob && typeof dob.year === "number" && typeof dob.month === "number"
            ? { birth: { month: dob.month, year: dob.year } }
            : {}),
          corporate: r.identification !== undefined,
        };
      });
      return listResult(
        data,
        b?.total_results ?? items.length,
        evidence(`${PUBLIC}/company/${n}/officers`, n, got),
      );
    },

    async getControllers(n) {
      const got = await get(
        `/company/${encodeURIComponent(n)}/persons-with-significant-control`,
        { items_per_page: DEFAULT_CAP },
      );
      const b = got.body as Json;
      const items = itemsOf(b, b?.total_results);
      const data = items.map((r): Controller => {
        const id = lastSegment(r.links?.self);
        if (!id) throw bad("Companies House controller has no id");
        return {
          id,
          name: String(r.name ?? ""),
          kind: String(r.kind ?? ""),
          ...opt("notifiedOn", r.notified_on),
          ...opt("ceasedOn", r.ceased_on),
          natures: Array.isArray(r.natures_of_control) ? r.natures_of_control : [],
        };
      });
      return listResult(
        data,
        b?.total_results ?? items.length,
        evidence(`${PUBLIC}/company/${n}/persons-with-significant-control`, n, got),
      );
    },

    async getFilings(n, opts) {
      const cap = capOf(opts?.cap);
      const got = await get(`/company/${encodeURIComponent(n)}/filing-history`, {
        items_per_page: Math.min(cap, MAX_PAGE),
      });
      const b = got.body as Json;
      const items = itemsOf(b, b?.total_count).slice(0, cap);
      const data = items.map(
        (r): Filing => ({
          transactionId: String(r.transaction_id ?? ""),
          date: String(r.date ?? ""),
          category: String(r.category ?? ""),
          type: String(r.type ?? ""),
          description: String(r.description ?? ""),
        }),
      );
      return listResult(
        data,
        b?.total_count ?? items.length,
        evidence(`${PUBLIC}/company/${n}/filing-history`, n, got),
      );
    },

    async getAppointments(officerId, opts) {
      const cap = capOf(opts?.cap);
      const got = await get(
        `/officers/${encodeURIComponent(officerId)}/appointments`,
        { items_per_page: Math.min(cap, MAX_PAGE) },
      );
      const b = got.body as Json;
      const items = itemsOf(b, b?.total_results).slice(0, cap);
      const data = items.map((r): Appointment => {
        const to = r.appointed_to;
        if (!to?.company_number) throw bad("Companies House appointment has no company");
        return {
          companyNumber: String(to.company_number),
          companyName: String(to.company_name ?? ""),
          ...opt("companyStatus", to.company_status),
          role: String(r.officer_role ?? ""),
          ...opt("appointedOn", r.appointed_on),
          ...opt("resignedOn", r.resigned_on),
        };
      });
      return listResult(
        data,
        b?.total_results ?? items.length,
        evidence(`${PUBLIC}/officers/${officerId}/appointments`, officerId, got),
      );
    },

    async searchByLocation(q, opts) {
      const cap = capOf(opts?.cap);
      const got = await get("/advanced-search/companies", {
        location: q,
        size: cap,
      });
      const b = got.body as Json;
      const items = itemsOf(b, b?.hits).slice(0, cap);
      return listResult(
        items.map((r) => hitOf(r, "company_name")),
        b?.hits ?? items.length,
        evidence(
          `${PUBLIC}/advanced-search/get-results?location=${encodeURIComponent(q)}`,
          `location:${q}`,
          got,
        ),
      );
    },
  };
}
