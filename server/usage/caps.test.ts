import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import { CapError, assertKillSwitchOff, assertWithinCaps, recordUsage } from "./caps.js";

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
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();

    await record(ALICE, "case-create", 1);
    await expect(assertWithinCaps(ALICE, "case-create")).rejects.toMatchObject({
      name: "CapError",
      kind: "case-create",
      message: "Daily limit reached. Try again tomorrow.",
    });
    await expect(assertWithinCaps(BOB, "case-create")).resolves.toBeUndefined();
  });

  it("the Companies House per-user cap defaults to 300 and can be set", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_PER_USER_DAY", "2");
    await record(ALICE, "ch-call", 2);

    await expect(assertWithinCaps(ALICE, "ch-call")).rejects.toBeInstanceOf(CapError);
    await expect(assertWithinCaps(BOB, "ch-call")).resolves.toBeUndefined();
  });

  it("the global Companies House budget refuses every user once spent", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_GLOBAL_DAY", "3");
    await record(ALICE, "ch-call", 2);
    await record(BOB, "ch-call", 1);

    await expect(assertWithinCaps(CAROL, "ch-call")).rejects.toMatchObject({
      kind: "ch-call",
      message: "Daily limit reached. Try again tomorrow.",
    });
    // The global budget only covers Companies House calls.
    await expect(assertWithinCaps(CAROL, "case-create")).resolves.toBeUndefined();
  });

  it("agent runs are capped per user, 20 a day by default", async () => {
    await record(ALICE, "agent-run", 19);
    await expect(assertWithinCaps(ALICE, "agent-run")).resolves.toBeUndefined();
    await record(ALICE, "agent-run", 1);
    await expect(assertWithinCaps(ALICE, "agent-run")).rejects.toMatchObject({
      kind: "agent-run",
    });

    vi.stubEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", "30");
    await expect(assertWithinCaps(ALICE, "agent-run")).resolves.toBeUndefined();
  });

  it("agent continuations have their own, looser cap: ten times the run cap by default, and it can be set", async () => {
    vi.stubEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", "2");
    // Default is ten times the run cap, so 20 here.
    await record(ALICE, "agent-continuation", 19);
    await expect(assertWithinCaps(ALICE, "agent-continuation")).resolves.toBeUndefined();
    await record(ALICE, "agent-continuation", 1);
    await expect(assertWithinCaps(ALICE, "agent-continuation")).rejects.toMatchObject({
      name: "CapError",
      kind: "agent-continuation",
    });
    // Spending continuations does not use up the person's runs, and the reverse.
    await expect(assertWithinCaps(ALICE, "agent-run")).resolves.toBeUndefined();
    await expect(assertWithinCaps(BOB, "agent-continuation")).resolves.toBeUndefined();

    vi.stubEnv("REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY", "3");
    await record(CAROL, "agent-continuation", 3);
    await expect(assertWithinCaps(CAROL, "agent-continuation")).rejects.toBeInstanceOf(CapError);
  });

  it("recordUsage adds n at once", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "3");
    await recordUsage(ALICE, "case-create", 3);
    await expect(assertWithinCaps(ALICE, "case-create")).rejects.toBeInstanceOf(CapError);
  });

  it("a new day resets per-user counts", async () => {
    const evening = new Date("2026-11-03T23:59:00Z");
    const morning = new Date("2026-11-04T00:01:00Z");
    await record(ALICE, "case-create", 10, evening);

    await expect(assertWithinCaps(ALICE, "case-create", evening)).rejects.toBeInstanceOf(CapError);
    await expect(assertWithinCaps(ALICE, "case-create", morning)).resolves.toBeUndefined();
  });

  it("a setting that is not a whole number falls back to the default", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "lots");
    await record(ALICE, "case-create", 9);
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();

    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "");
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();
  });

  it("a cap set to 0 refuses everything of that kind", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "0");
    await expect(assertWithinCaps(ALICE, "case-create")).rejects.toBeInstanceOf(CapError);
  });
});

describe("kill switch", () => {
  it("refuses everything", async () => {
    vi.stubEnv("REDSTRING_KILL_SWITCH", "1");

    for (const kind of ["ch-call", "case-create", "agent-run"] as const) {
      await expect(assertWithinCaps(ALICE, kind)).rejects.toMatchObject({
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
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();
    vi.stubEnv("REDSTRING_KILL_SWITCH", "0");
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();
    vi.stubEnv("REDSTRING_KILL_SWITCH", "");
    await expect(assertWithinCaps(ALICE, "case-create")).resolves.toBeUndefined();
  });
});
