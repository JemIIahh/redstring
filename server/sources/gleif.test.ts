import { describe, expect, it } from "vitest";

import { createGleifClient } from "./gleif.js";
import { fakeFetch, fixture } from "./test-helpers.js";

const empty = { meta: { pagination: { total: 0 } }, data: [] };

describe("GLEIF client", () => {
  it("finds records by exact legal name and flags which parents exist", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: fixture("gleif/lei-records-barclays-uk.json"),
    }));

    const result = await createGleifClient({ fetch }).findByName("BARCLAYS BANK UK PLC");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe("/api/v1/lei-records");
    expect(calls[0]?.url.searchParams.get("filter[entity.legalName]")).toBe(
      "BARCLAYS BANK UK PLC",
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      lei: "213800UUGANOMFJ9X769",
      name: "BARCLAYS BANK UK PLC",
      status: "ACTIVE",
      jurisdiction: "GB",
      registeredAs: "09740322",
      parents: ["direct", "ultimate"],
      url: "https://search.gleif.org/#/record/213800UUGANOMFJ9X769",
    });
    expect(result.data[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidence).toMatchObject({
      source: "gleif",
      recordId: "search:BARCLAYS BANK UK PLC",
    });
    expect(result.complete).toBe(true);
  });

  it("an empty result is a normal null", async () => {
    const { fetch } = fakeFetch((c) =>
      c.url.pathname.endsWith("fuzzycompletions")
        ? { body: { data: [] } }
        : { body: empty },
    );

    const result = await createGleifClient({ fetch }).findByName("Nobody Ltd");

    expect(result.data).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.note).toBe("no LEI found");
  });

  it("falls back to fuzzy completions when the exact name finds nothing", async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.pathname.endsWith("fuzzycompletions")) {
        return { body: fixture("gleif/fuzzy-completions-example.json") };
      }
      return c.url.searchParams.get("filter[entity.legalName]") === "EXAMPLE PARENT PLC"
        ? { body: { meta: { pagination: { total: 1 } }, data: [fixture("gleif/lei-record-parent.json").data] } }
        : { body: empty };
    });

    const result = await createGleifClient({ fetch }).findByName("example parent");

    expect(result.data.map((r) => r.lei)).toEqual(["EXAMPLEPARENTLEI000001"]);
    expect(result.data[0]?.parents).toEqual([]);
    expect(calls.map((c) => c.url.pathname.split("/").pop())).toContain("fuzzycompletions");
  });

  it("getParent returns the parent record", async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: fixture("gleif/lei-record-parent.json"),
    }));

    const result = await createGleifClient({ fetch }).getParent("213800UUGANOMFJ9X769", "direct");

    expect(calls[0]?.url.pathname).toBe("/api/v1/lei-records/213800UUGANOMFJ9X769/direct-parent");
    expect(result.data?.lei).toBe("EXAMPLEPARENTLEI000001");
    expect(result.evidence.recordId).toBe("EXAMPLEPARENTLEI000001");
  });

  it("getParent is a normal null when none is reported", async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: {} }));

    const result = await createGleifClient({ fetch }).getParent("213800UUGANOMFJ9X769", "ultimate");

    expect(result.data).toBeNull();
    expect(result.complete).toBe(true);
    expect(result.note).toBe("no ultimate parent reported");
  });

  it("maps 429 to rate_limited", async () => {
    const { fetch } = fakeFetch(() => ({ status: 429 }));
    await expect(createGleifClient({ fetch }).findByName("X")).rejects.toMatchObject({
      source: "gleif",
      kind: "rate_limited",
    });
  });
});
