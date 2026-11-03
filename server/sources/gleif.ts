// Endpoints (no key; the first three confirmed live 2026-11-03):
//   GET https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=<exact name>
//        (exact legal name only; a near miss returns an empty list)
//   GET https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=<name>
//        -> data[].attributes.value: candidate legal names to retry exactly
//   Public record page: https://search.gleif.org/#/record/<LEI>
//   GET .../lei-records/<LEI>/direct-parent and .../ultimate-parent -> the parent
//        record; a 404 is read as "none reported" (not yet checked against a live
//        entity without a parent).
import { contentHash } from "./hash.js";
import { fetchBody } from "./http.js";
import { SourceError, type SourceResult } from "./types.js";

const SOURCE = "gleif";
const API = "https://api.gleif.org/api/v1";
const PAGE_SIZE = 10;
const MAX_FUZZY_NAMES = 3;

export interface LeiRecord {
  lei: string;
  name: string;
  status: string;
  jurisdiction?: string;
  registeredAs?: string;
  country?: string;
  /** Which parent links the record advertises; `getParent` resolves them. */
  parents: Array<"direct" | "ultimate">;
  url: string;
  hash: string;
}

export interface GleifClient {
  findByName(name: string): Promise<SourceResult<LeiRecord[]>>;
  getParent(
    lei: string,
    kind: "direct" | "ultimate",
  ): Promise<SourceResult<LeiRecord | null>>;
}

type Json = Record<string, any>;

function recordOf(r: Json): LeiRecord {
  const a = r?.attributes;
  const lei = a?.lei ?? r?.id;
  if (typeof lei !== "string" || !lei) {
    throw new SourceError(SOURCE, "bad_response", "GLEIF record has no LEI");
  }
  const entity = a?.entity ?? {};
  const rel = r?.relationships ?? {};
  const opt = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const jurisdiction = opt(entity.jurisdiction);
  const registeredAs = opt(entity.registeredAs);
  const country = opt(entity.legalAddress?.country);
  return {
    lei,
    name: String(entity.legalName?.name ?? ""),
    status: String(entity.status ?? ""),
    ...(jurisdiction ? { jurisdiction } : {}),
    ...(registeredAs ? { registeredAs } : {}),
    ...(country ? { country } : {}),
    parents: (["direct", "ultimate"] as const).filter((k) => rel[`${k}-parent`]),
    url: `https://search.gleif.org/#/record/${lei}`,
    hash: contentHash(r),
  };
}

export function createGleifClient(o: {
  fetch?: typeof fetch;
  timeoutMs?: number;
} = {}): GleifClient {
  const doFetch = o.fetch ?? fetch;
  const timeoutMs = o.timeoutMs ?? 15_000;
  const headers = { accept: "application/vnd.api+json" };

  const get = (url: string) =>
    fetchBody({ source: SOURCE, fetch: doFetch, url, init: { headers }, timeoutMs });

  async function exact(name: string) {
    const url = new URL(`${API}/lei-records`);
    url.searchParams.set("filter[entity.legalName]", name);
    url.searchParams.set("page[size]", String(PAGE_SIZE));
    const got = await get(url.toString());
    const b = got.body as Json;
    if (!Array.isArray(b?.data)) {
      throw new SourceError(SOURCE, "bad_response", "GLEIF answered without a data list");
    }
    return {
      body: got.body,
      retrievedAt: got.retrievedAt,
      records: (b.data as Json[]).map(recordOf),
      total: Number(b?.meta?.pagination?.total ?? b.data.length),
    };
  }

  return {
    async findByName(name) {
      const bodies: unknown[] = [];
      const first = await exact(name);
      bodies.push(first.body);
      let records = first.records;
      let complete = first.total <= records.length;
      let retrievedAt = first.retrievedAt;

      if (records.length === 0) {
        const url = new URL(`${API}/fuzzycompletions`);
        url.searchParams.set("field", "entity.legalName");
        url.searchParams.set("q", name);
        const fuzzy = await get(url.toString());
        bodies.push(fuzzy.body);
        retrievedAt = fuzzy.retrievedAt;
        const values = [
          ...new Set(
            ((fuzzy.body as Json)?.data ?? [])
              .map((d: Json) => d?.attributes?.value)
              .filter((v: unknown): v is string => typeof v === "string"),
          ),
        ] as string[];
        complete = values.length <= MAX_FUZZY_NAMES;
        const seen = new Set<string>();
        records = [];
        for (const value of values.slice(0, MAX_FUZZY_NAMES)) {
          const next = await exact(value);
          bodies.push(next.body);
          for (const r of next.records) {
            if (!seen.has(r.lei)) {
              seen.add(r.lei);
              records.push(r);
            }
          }
        }
        records = records.slice(0, PAGE_SIZE);
      }

      return {
        data: records,
        evidence: {
          source: SOURCE,
          url: "https://search.gleif.org/",
          recordId: `search:${name}`,
          retrievedAt,
          contentHash: contentHash(bodies),
        },
        complete,
        ...(records.length === 0
          ? { note: "no LEI found" }
          : complete
            ? {}
            : { note: `showing ${records.length} closest matches` }),
      };
    },

    async getParent(lei, kind) {
      const url = `${API}/lei-records/${encodeURIComponent(lei)}/${kind}-parent`;
      try {
        const got = await get(url);
        const data = (got.body as Json)?.data;
        const parent = recordOf(data);
        return {
          data: parent,
          evidence: {
            source: SOURCE,
            url: parent.url,
            recordId: parent.lei,
            retrievedAt: got.retrievedAt,
            contentHash: parent.hash,
          },
          complete: true,
        };
      } catch (e) {
        if (e instanceof SourceError && e.kind === "not_found") {
          return {
            data: null,
            evidence: {
              source: SOURCE,
              url: `https://search.gleif.org/#/record/${lei}`,
              recordId: `${kind}-parent:${lei}`,
              retrievedAt: new Date().toISOString(),
              contentHash: contentHash({ lei, kind, reported: false }),
            },
            complete: true,
            note: `no ${kind} parent reported`,
          };
        }
        throw e;
      }
    },
  };
}
