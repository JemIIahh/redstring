import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import { createDbLimiter } from "./db-limiter.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

const WINDOW = 300_000;

describe("createDbLimiter", () => {
  it("allows max then refuses within one window across two limiter instances", async () => {
    const t = 1_000_000;
    const a = createDbLimiter({ key: "ch", max: 3, windowMs: WINDOW, now: () => t });
    const b = createDbLimiter({ key: "ch", max: 3, windowMs: WINDOW, now: () => t });

    const results = [
      await a.take(),
      await b.take(),
      await a.take(),
      await b.take(),
      await a.take(),
    ];

    expect(results).toEqual([true, true, true, false, false]);
  });

  it("a new window allows again, and resetAt is the end of the current window", async () => {
    let t = 1_000_000; // window 900_000 .. 1_200_000
    const limiter = createDbLimiter({ key: "ch", max: 1, windowMs: WINDOW, now: () => t });

    expect(await limiter.take()).toBe(true);
    expect(await limiter.take()).toBe(false);
    expect(limiter.resetAt()).toBe(1_200_000);

    t = 1_200_000;
    expect(await limiter.take()).toBe(true);
    expect(limiter.resetAt()).toBe(1_500_000);
  });

  it("different keys keep separate budgets", async () => {
    const t = 1_000_000;
    const a = createDbLimiter({ key: "one", max: 1, windowMs: WINDOW, now: () => t });
    const b = createDbLimiter({ key: "two", max: 1, windowMs: WINDOW, now: () => t });

    expect(await a.take()).toBe(true);
    expect(await b.take()).toBe(true);
    expect(await a.take()).toBe(false);
  });

  it("a max of 0 refuses everything", async () => {
    const limiter = createDbLimiter({ key: "ch", max: 0, windowMs: WINDOW });
    expect(await limiter.take()).toBe(false);
  });

  it("ten takes at once never get more than max through", async () => {
    const t = 1_000_000;
    const limiter = createDbLimiter({ key: "ch", max: 3, windowMs: WINDOW, now: () => t });

    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.take()));

    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
