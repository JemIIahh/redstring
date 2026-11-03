import { describe, expect, it } from "vitest";

import { createLimiter } from "./limiter.js";

describe("createLimiter", () => {
  it("allows max then refuses until the window ends", async () => {
    let t = 0;
    const limiter = createLimiter({ max: 3, windowMs: 1000, now: () => t });

    expect(await limiter.take()).toBe(true);
    expect(await limiter.take()).toBe(true);
    expect(await limiter.take()).toBe(true);
    expect(await limiter.take()).toBe(false);
    expect(limiter.resetAt()).toBe(1000);

    t = 999;
    expect(await limiter.take()).toBe(false);

    t = 1000;
    expect(await limiter.take()).toBe(true);
    expect(limiter.resetAt()).toBe(2000);
  });

  it("a refused take does not extend the window", async () => {
    let t = 0;
    const limiter = createLimiter({ max: 1, windowMs: 1000, now: () => t });

    await limiter.take();
    t = 500;
    await limiter.take();
    expect(limiter.resetAt()).toBe(1000);
  });

  it("resetAt before any call is the current time", () => {
    const limiter = createLimiter({ max: 1, windowMs: 1000, now: () => 42 });
    expect(limiter.resetAt()).toBe(42);
  });
});
