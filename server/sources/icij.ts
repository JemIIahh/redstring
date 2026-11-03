// Endpoints confirmed live 2026-11-03:
//   POST https://offshoreleaks.icij.org/api/v1/reconcile  {"queries":{"q0":{"query":"<name>"}}}
//        -> {"q0":{"result":[{id,name,description,match,score,types}]}}
//   Public node page: https://offshoreleaks.icij.org/nodes/<id>  (HTTP 200)
// Results are fuzzy name matches: every one is a candidate, never a confirmed match.
import { contentHash } from "./hash.js";
import { fetchBody } from "./http.js";
import { SourceError, type SourceResult } from "./types.js";

const SOURCE = "icij";

export interface IcijCandidate {
  id: string;
  name: string;
  score: number;
  matched: boolean;
  description: string;
  url: string;
}

export interface IcijClient {
  reconcile(name: string): Promise<SourceResult<IcijCandidate[]>>;
}

export function createIcijClient(o: {
  fetch?: typeof fetch;
  timeoutMs?: number;
} = {}): IcijClient {
  const doFetch = o.fetch ?? fetch;
  const timeoutMs = o.timeoutMs ?? 15_000;

  return {
    async reconcile(name) {
      const { body, retrievedAt } = await fetchBody({
        source: SOURCE,
        fetch: doFetch,
        url: "https://offshoreleaks.icij.org/api/v1/reconcile",
        init: {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ queries: { q0: { query: name } } }),
        },
        timeoutMs,
      });

      const result = (body as { q0?: { result?: unknown } } | null)?.q0?.result;
      if (!Array.isArray(result)) {
        throw new SourceError(SOURCE, "bad_response", "ICIJ answered without a result list");
      }
      const data = result.map(
        (r: Record<string, unknown>): IcijCandidate => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          score: Number(r.score ?? 0),
          matched: r.match === true,
          description: String(r.description ?? ""),
          url: `https://offshoreleaks.icij.org/nodes/${String(r.id)}`,
        }),
      );

      return {
        data,
        evidence: {
          source: SOURCE,
          url: `https://offshoreleaks.icij.org/search?q=${encodeURIComponent(name)}`,
          recordId: `search:${name}`,
          retrievedAt,
          contentHash: contentHash(body),
        },
        complete: true,
        ...(data.length === 0 ? { note: "no match in Offshore Leaks" } : {}),
      };
    },
  };
}
