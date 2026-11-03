import { describe, expect, it } from "vitest";

import { createCache } from "./cache.js";

describe("createCache", () => {
  it("returns what was set until the ttl passes", () => {
    let t = 0;
    const cache = createCache(1000, () => t);

    cache.set("k", { a: 1 });
    t = 999;
    expect(cache.get("k")).toEqual({ a: 1 });
  });

  it("expires after ttl", () => {
    let t = 0;
    const cache = createCache(1000, () => t);

    cache.set("k", "v");
    t = 1000;
    expect(cache.get("k")).toBeUndefined();
  });

  it("an unknown key is undefined", () => {
    expect(createCache(1000).get("nope")).toBeUndefined();
  });

  it("setting a key again restarts its ttl", () => {
    let t = 0;
    const cache = createCache(1000, () => t);

    cache.set("k", "old");
    t = 800;
    cache.set("k", "new");
    t = 1500;
    expect(cache.get("k")).toBe("new");
  });
});
