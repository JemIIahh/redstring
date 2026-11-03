import { describe, expect, it } from "vitest";

import {
  BANNED_WORDS,
  LanguageError,
  assertAgentText,
  lintAgentText,
} from "./language.js";

describe("lintAgentText", () => {
  it("plain description of records is clean", () => {
    expect(lintAgentText("Records show 11 companies at this address")).toEqual([]);
  });

  it("returns the banned words found, in the order they appear", () => {
    expect(lintAgentText("a suspicious fraud network")).toEqual([
      "suspicious",
      "fraud",
    ]);
  });

  it("matches whole words regardless of case", () => {
    expect(lintAgentText("SUSPICIOUS activity")).toEqual(["suspicious"]);
    expect(lintAgentText("Fraudulent filings")).toEqual(["fraudulent"]);
  });

  it("does not match a banned word inside a longer word", () => {
    expect(lintAgentText("The Illegalese Society and Scampi Ltd")).toEqual([]);
  });

  it("catches plurals and reports the base word once", () => {
    expect(lintAgentText("scams, scams and criminals")).toEqual([
      "scam",
      "criminal",
    ]);
  });

  it("the banned list is exactly the agreed words", () => {
    expect([...BANNED_WORDS]).toEqual([
      "suspicious",
      "shady",
      "guilty",
      "criminal",
      "fraud",
      "fraudulent",
      "launderer",
      "laundering",
      "corrupt",
      "illegal",
      "scam",
    ]);
  });
});

describe("assertAgentText", () => {
  it("passes clean text", () => {
    expect(() =>
      assertAgentText("Companies House lists X as a member since 2011"),
    ).not.toThrow();
  });

  it("throws a LanguageError naming the words", () => {
    try {
      assertAgentText("This looks like a scam");
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LanguageError);
      expect((e as LanguageError).words).toEqual(["scam"]);
    }
  });
});
