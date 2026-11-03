import { describe, expect, it } from "vitest";

import { contentHash } from "./hash.js";
import { createIcijClient } from "./icij.js";
import { fakeFetch, fixture } from "./test-helpers.js";

describe("ICIJ Offshore Leaks client", () => {
  it("returns candidates with score and matched=false for fuzzy hits", async () => {
    const body = fixture("icij/reconcile-example-holdings.json");
    const { fetch, calls } = fakeFetch(() => ({ body }));
    const icij = createIcijClient({ fetch });

    const result = await icij.reconcile("Example Holdings");

    expect(result.data).toHaveLength(4);
    expect(result.data[0]).toEqual({
      id: "10111600",
      name: "EXAMPLE LIMITED",
      score: 56.25,
      matched: false,
      description: "Entity node extracted from the Panama Papers data.",
      url: "https://offshoreleaks.icij.org/nodes/10111600",
    });
    expect(result.data.every((c) => c.matched === false)).toBe(true);
    expect(result.complete).toBe(true);

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.toString()).toBe(
      "https://offshoreleaks.icij.org/api/v1/reconcile",
    );
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      queries: { q0: { query: "Example Holdings" } },
    });
  });

  it("carries evidence: source, a public search page, a record id and the body hash", async () => {
    const body = fixture("icij/reconcile-example-holdings.json");
    const { fetch } = fakeFetch(() => ({ body }));

    const { evidence } = await createIcijClient({ fetch }).reconcile("Example Holdings");

    expect(evidence).toMatchObject({
      source: "icij",
      url: "https://offshoreleaks.icij.org/search?q=Example%20Holdings",
      recordId: "search:Example Holdings",
      contentHash: contentHash(body),
    });
    expect(Number.isNaN(Date.parse(evidence.retrievedAt))).toBe(false);
  });

  it("an empty result is a normal null, not an error", async () => {
    const { fetch } = fakeFetch(() => ({ body: { q0: { result: [] } } }));

    const result = await createIcijClient({ fetch }).reconcile("Nobody Ltd");

    expect(result.data).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.note).toBe("no match in Offshore Leaks");
  });

  it("a response without the query answer is a bad_response", async () => {
    const { fetch } = fakeFetch(() => ({ body: { something: "else" } }));
    await expect(createIcijClient({ fetch }).reconcile("X")).rejects.toMatchObject({
      name: "SourceError",
      source: "icij",
      kind: "bad_response",
    });
  });

  it("maps 429 to rate_limited and 503 to bad_response", async () => {
    const limited = fakeFetch(() => ({ status: 429 }));
    await expect(createIcijClient({ fetch: limited.fetch }).reconcile("X")).rejects.toMatchObject({ kind: "rate_limited" });
    const down = fakeFetch(() => ({ status: 503 }));
    await expect(createIcijClient({ fetch: down.fetch }).reconcile("X")).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("maps an aborted request to timeout", async () => {
    const icij = createIcijClient({
      timeoutMs: 5,
      fetch: ((_u: unknown, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () =>
            rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        })) as unknown as typeof fetch,
    });
    await expect(icij.reconcile("X")).rejects.toMatchObject({ kind: "timeout" });
  });
});
