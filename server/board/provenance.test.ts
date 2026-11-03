import { describe, expect, it } from "vitest";

import {
  ProvenanceError,
  assertEvidence,
  assertTransition,
  canTransition,
} from "./provenance.js";
import type { Actor, EvidenceInput, Status } from "./types.js";

const good: EvidenceInput = {
  source: "companies-house",
  url: "https://find-and-update.company-information.service.gov.uk/company/OC372263",
  recordId: "OC372263",
  retrievedAt: "2026-11-03T10:00:00.000Z",
  contentHash: "abc123",
};

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProvenanceError) return e.code;
    throw e;
  }
  return undefined;
}

describe("assertEvidence", () => {
  it("accepts a complete evidence item", () => {
    expect(() => assertEvidence([good])).not.toThrow();
  });

  it("an empty list throws no_source", () => {
    expect(codeOf(() => assertEvidence([]))).toBe("no_source");
  });

  it("an item with an empty recordId throws no_source", () => {
    expect(codeOf(() => assertEvidence([{ ...good, recordId: "  " }]))).toBe(
      "no_source",
    );
  });

  it("an item with no retrievedAt or contentHash throws no_source", () => {
    expect(codeOf(() => assertEvidence([{ ...good, retrievedAt: "" }]))).toBe(
      "no_source",
    );
    expect(codeOf(() => assertEvidence([{ ...good, contentHash: "" }]))).toBe(
      "no_source",
    );
  });

  it("an http:// URL throws bad_url", () => {
    expect(
      codeOf(() =>
        assertEvidence([
          { ...good, url: "http://find-and-update.company-information.service.gov.uk/x" },
        ]),
      ),
    ).toBe("bad_url");
  });

  it("a string that is not a URL throws bad_url", () => {
    expect(codeOf(() => assertEvidence([{ ...good, url: "not a url" }]))).toBe(
      "bad_url",
    );
  });

  it("one bad item among good ones is enough to refuse the list", () => {
    expect(
      codeOf(() => assertEvidence([good, { ...good, recordId: "" }])),
    ).toBe("no_source");
  });
});

describe("transitions", () => {
  const rows: Array<[Actor, Status, Status, boolean]> = [
    ["agent", "proposed", "proposed", true],
    ["agent", "proposed", "confirmed", false],
    ["agent", "proposed", "rejected", false],
    ["agent", "proposed", "dead-end", false],
    ["agent", "rejected", "proposed", false],
    ["agent", "dead-end", "proposed", false],
    ["person", "proposed", "confirmed", true],
    ["person", "confirmed", "rejected", true],
    ["person", "rejected", "confirmed", true],
    ["person", "dead-end", "proposed", true],
  ];

  it.each(rows)("%s %s -> %s is %s", (actor, from, to, allowed) => {
    expect(canTransition(from, to, actor)).toBe(allowed);
  });

  it("an agent asking for a person-only transition gets agent_not_allowed", () => {
    expect(
      codeOf(() =>
        assertTransition("proposed", "confirmed", "agent", "looks right"),
      ),
    ).toBe("agent_not_allowed");
  });

  it("rejected and dead-end need a reason", () => {
    expect(codeOf(() => assertTransition("proposed", "rejected", "person"))).toBe(
      "reason_required",
    );
    expect(
      codeOf(() => assertTransition("proposed", "dead-end", "person", "   ")),
    ).toBe("reason_required");
    expect(() =>
      assertTransition("proposed", "rejected", "person", "Different company"),
    ).not.toThrow();
  });

  it("confirming needs no reason", () => {
    expect(() => assertTransition("proposed", "confirmed", "person")).not.toThrow();
  });

  it("an unknown status is bad_transition", () => {
    expect(
      codeOf(() =>
        assertTransition("proposed", "maybe" as unknown as Status, "person"),
      ),
    ).toBe("bad_transition");
  });
});
