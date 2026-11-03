import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { contentHash } from "./hash.js";

describe("contentHash", () => {
  it("is a sha-256 hex digest of the JSON", () => {
    const expected = createHash("sha256").update('{"a":1}').digest("hex");
    expect(contentHash({ a: 1 })).toBe(expected);
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across key order, including nested objects", () => {
    expect(contentHash({ a: 1, b: { c: 2, d: [1, { x: 1, y: 2 }] } })).toBe(
      contentHash({ b: { d: [1, { y: 2, x: 1 }], c: 2 }, a: 1 }),
    );
  });

  it("differs when a value changes", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });

  it("array order matters", () => {
    expect(contentHash([1, 2])).not.toBe(contentHash([2, 1]));
  });

  it("hashes a body with no value without throwing", () => {
    expect(contentHash(undefined)).toBe(contentHash(null));
  });
});
