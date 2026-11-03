import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import { and, eq } from "drizzle-orm";

import { usage } from "../db/schema.js";
import { CapError, assertKillSwitchOff, recordUsage, takeUsage } from "./caps.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";
const CAROL = "carol@example.com";

async function record(owner: string, kind: Parameters<typeof recordUsage>[1], times: number, now?: Date) {
  for (let i = 0; i < times; i++) await recordUsage(owner, kind, 1, now);
}

/** What the day's counter says for one owner and kind. */
async function used(owner: string, kind: string, bucket = new Date().toISOString().slice(0, 10)): Promise<number> {
  const rows = await testDb
    .select({ n: usage.count })
    .from(usage)
    .where(and(eq(usage.ownerEmail, owner), eq(usage.kind, kind), eq(usage.bucket, bucket)));
  return rows[0]?.n ?? 0;
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe("daily caps", () => {
  it("the 11th case in a day is refused for that user only", async () => {
    await record(ALICE, "case-create", 9);
    await expect(takeUsage(ALICE, "case-create")).resolves.toBeUndefined();

    await record(ALICE, "case-create", 1);
    await expect(takeUsage(ALICE, "case-create")).rejects.toMatchObject({
      name: "CapError",
      kind: "case-create",
      message: "Daily limit reached. Try again tomorrow.",
    });
    await expect(takeUsage(BOB, "case-create")).resolves.toBeUndefined();
  });

  it("the Companies House per-user cap defaults to 300 and can be set", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_PER_USER_DAY", "2");
    await record(ALICE, "ch-call", 2);

    await expect(takeUsage(ALICE, "ch-call")).rejects.toBeInstanceOf(CapError);
    await expect(takeUsage(BOB, "ch-call")).resolves.toBeUndefined();
  });

  it("the global Companies House budget refuses every user once spent, and the refused try is not counted", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_GLOBAL_DAY", "3");
    await takeUsage(ALICE, "ch-call");
    await takeUsage(ALICE, "ch-call");
    await takeUsage(BOB, "ch-call");

    await expect(takeUsage(CAROL, "ch-call")).rejects.toMatchObject({
      kind: "ch-call",
      message: "Daily limit reached. Try again tomorrow.",
    });
    expect(await used(CAROL, "ch-call")).toBe(0);
    // The global budget only covers Companies House calls.
    await expect(takeUsage(CAROL, "case-create")).resolves.toBeUndefined();
  });

  it("agent runs are capped per user, 20 a day by default", async () => {
    await record(ALICE, "agent-run", 19);
    await expect(takeUsage(ALICE, "agent-run")).resolves.toBeUndefined();
    await record(ALICE, "agent-run", 1);
    await expect(takeUsage(ALICE, "agent-run")).rejects.toMatchObject({
      kind: "agent-run",
    });

    vi.stubEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", "30");
    await expect(takeUsage(ALICE, "agent-run")).resolves.toBeUndefined();
  });

  it("agent continuations have their own, looser cap: ten times the run cap by default, and it can be set", async () => {
    vi.stubEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", "2");
    // Default is ten times the run cap, so 20 here.
    await record(ALICE, "agent-continuation", 19);
    await expect(takeUsage(ALICE, "agent-continuation")).resolves.toBeUndefined();
    await record(ALICE, "agent-continuation", 1);
    await expect(takeUsage(ALICE, "agent-continuation")).rejects.toMatchObject({
      name: "CapError",
      kind: "agent-continuation",
    });
    // Spending continuations does not use up the person's runs, and the reverse.
    await expect(takeUsage(ALICE, "agent-run")).resolves.toBeUndefined();
    await expect(takeUsage(BOB, "agent-continuation")).resolves.toBeUndefined();

    vi.stubEnv("REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY", "3");
    await record(CAROL, "agent-continuation", 3);
    await expect(takeUsage(CAROL, "agent-continuation")).rejects.toBeInstanceOf(CapError);
  });

  it("recordUsage adds n at once", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "3");
    await recordUsage(ALICE, "case-create", 3);
    await expect(takeUsage(ALICE, "case-create")).rejects.toBeInstanceOf(CapError);
  });

  it("a new day resets per-user counts", async () => {
    const evening = new Date("2026-11-03T23:59:00Z");
    const morning = new Date("2026-11-04T00:01:00Z");
    await record(ALICE, "case-create", 10, evening);

    await expect(takeUsage(ALICE, "case-create", evening)).rejects.toBeInstanceOf(CapError);
    await expect(takeUsage(ALICE, "case-create", morning)).resolves.toBeUndefined();
  });

  it("a setting that is not a whole number falls back to the default", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "lots");
    await record(ALICE, "case-create", 9);
    await expect(takeUsage(ALICE, "case-create")).resolves.toBeUndefined();

    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "");
    await record(BOB, "case-create", 9);
    await expect(takeUsage(BOB, "case-create")).resolves.toBeUndefined();
  });

  it("a cap set to 0 refuses everything of that kind", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "0");
    await expect(takeUsage(ALICE, "case-create")).rejects.toBeInstanceOf(CapError);
  });
});

describe("taking a unit is one step", () => {
  const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps);

  it("a burst of parallel requests cannot get past the daily limit", async () => {
    const results = await settle(Array.from({ length: 30 }, () => takeUsage(ALICE, "agent-run")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused).toHaveLength(10);
    for (const r of refused) expect(r.reason).toBeInstanceOf(CapError);
    expect(await used(ALICE, "agent-run")).toBe(20);
  });

  it("a burst from many people cannot get past the global Companies House budget", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_GLOBAL_DAY", "4");
    const people = Array.from({ length: 9 }, (_, i) => `user${i}@example.com`);
    const results = await settle(people.map((p) => takeUsage(p, "ch-call")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    let total = 0;
    for (const p of people) total += await used(p, "ch-call");
    // The five refused tries were given back, so a person who was turned away is not charged.
    expect(total).toBe(4);
  });

  it("a cap set to 0 refuses the very first try", async () => {
    vi.stubEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", "0");
    await expect(takeUsage(ALICE, "agent-run")).rejects.toBeInstanceOf(CapError);
    expect(await used(ALICE, "agent-run")).toBe(0);
  });

  it("gives one back with a negative count, without going below what was taken", async () => {
    await takeUsage(ALICE, "case-create");
    await recordUsage(ALICE, "case-create", -1);
    expect(await used(ALICE, "case-create")).toBe(0);
  });
});

describe("kill switch", () => {
  it("refuses everything", async () => {
    vi.stubEnv("REDSTRING_KILL_SWITCH", "1");

    for (const kind of ["ch-call", "case-create", "agent-run"] as const) {
      await expect(takeUsage(ALICE, kind)).rejects.toMatchObject({
        name: "CapError",
        kind: "kill-switch",
      });
    }
  });

  it("can be checked on its own, without counting anything against a limit", async () => {
    await expect(assertKillSwitchOff()).resolves.toBeUndefined();
    vi.stubEnv("REDSTRING_KILL_SWITCH", "1");
    await expect(assertKillSwitchOff()).rejects.toMatchObject({ name: "CapError", kind: "kill-switch" });
    vi.stubEnv("REDSTRING_KILL_SWITCH", "0");
    await expect(assertKillSwitchOff()).resolves.toBeUndefined();
  });

  it("is off when unset, empty or 0", async () => {
    await expect(takeUsage(ALICE, "case-create")).resolves.toBeUndefined();
    vi.stubEnv("REDSTRING_KILL_SWITCH", "0");
    await expect(takeUsage(ALICE, "case-create")).resolves.toBeUndefined();
    vi.stubEnv("REDSTRING_KILL_SWITCH", "");
    await expect(takeUsage(ALICE, "case-create")).resolves.toBeUndefined();
  });
});
