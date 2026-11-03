import { describe, expect, it } from "vitest";

import { checkKnownList } from "./known-list.js";
import type { BoardNode, Status } from "./types.js";

function company(id: string, label: string, key: string, status: Status = "confirmed"): BoardNode {
  return {
    id,
    caseId: "c1",
    type: "company",
    key,
    label,
    facts: { number: key },
    status,
    addedBy: "person",
    evidence: [],
    createdAt: "2026-11-03T10:00:00.000Z",
  };
}

const board = {
  nodes: [
    company("n1", "LCM ALLIANCE LLP", "OC372263"),
    company("n2", "METASTAR LLP", "OC346224"),
    company("n3", "SMITH AND SONS LTD", "00000003"),
    company("n4", "OLD NAME LTD", "00000004", "rejected"),
    company("n5", "STALLED TRADING LIMITED", "00000005", "dead-end"),
  ],
};

describe("checkKnownList", () => {
  it("finds a name regardless of case and company suffix punctuation and reports the rest as missing", () => {
    const out = checkKnownList(
      ["lcm alliance l.l.p.", "Metastar LLP", "Unknown Holdings Ltd"],
      board,
    );
    expect(out.found).toEqual(["lcm alliance l.l.p.", "Metastar LLP"]);
    expect(out.missing).toEqual(["Unknown Holdings Ltd"]);
  });

  it("treats the long and short forms of a suffix, and & and 'and', as the same", () => {
    const out = checkKnownList(["Smith & Sons Limited", "Stalled Trading Ltd."], board);
    expect(out.found).toHaveLength(2);
    expect(out.missing).toEqual([]);
  });

  it("matches a company number however it was typed", () => {
    const out = checkKnownList(["oc372263", "OC 346224", "OC000000"], board);
    expect(out.found).toEqual(["oc372263", "OC 346224"]);
    expect(out.missing).toEqual(["OC000000"]);
  });

  it("does not match part of a name", () => {
    expect(checkKnownList(["LCM"], board)).toEqual({ found: [], missing: ["LCM"] });
    expect(checkKnownList(["LCM ALLIANCE LLP HOLDINGS"], board).found).toEqual([]);
  });

  it("does not count a card the person rejected, and does count a dead end", () => {
    const out = checkKnownList(["Old Name Ltd", "Stalled Trading Limited"], board);
    expect(out.missing).toEqual(["Old Name Ltd"]);
    expect(out.found).toEqual(["Stalled Trading Limited"]);
  });

  it("ignores blank lines and repeats, and keeps the person's own wording and order", () => {
    const out = checkKnownList(["  ", "Metastar LLP", "METASTAR LLP", "", "Nowhere Ltd", "Nowhere Ltd"], board);
    expect(out.found).toEqual(["Metastar LLP"]);
    expect(out.missing).toEqual(["Nowhere Ltd"]);
  });

  it("returns nothing for an empty list and for an empty board", () => {
    expect(checkKnownList([], board)).toEqual({ found: [], missing: [] });
    expect(checkKnownList(["Metastar LLP"], { nodes: [] })).toEqual({
      found: [],
      missing: ["Metastar LLP"],
    });
  });
});
