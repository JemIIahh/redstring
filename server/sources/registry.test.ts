import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import { usage } from "../db/schema.js";
import { createCache } from "./cache.js";
import { buildSources } from "./registry.js";
import { fakeFetch, fixture } from "./test-helpers.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";

function chFetch() {
  return fakeFetch((c) =>
    c.url.pathname.endsWith("/officers")
      ? { body: fixture("ch/officers-OC000001.json") }
      : { body: fixture("ch/company-OC000001.json") },
  );
}

async function chCallsFor(owner: string): Promise<number> {
  const rows = await testDb.select().from(usage);
  return rows
    .filter((r) => r.ownerEmail === owner && r.kind === "ch-call")
    .reduce((sum, r) => sum + r.count, 0);
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("COMPANIES_HOUSE_API_KEY", "test-key");
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

describe("buildSources", () => {
  it("records one ch-call per request that reaches Companies House", async () => {
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, { fetch, cache: createCache(60_000) });

    await s.ch.getCompany("OC000001");
    await s.ch.getOfficers("OC000001");

    expect(fn).toHaveBeenCalledTimes(2);
    expect(await chCallsFor(ALICE)).toBe(2);
  });

  it("a repeated request is answered from the cache and records nothing", async () => {
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, { fetch, cache: createCache(60_000) });

    await s.ch.getCompany("OC000001");
    await s.ch.getCompany("OC000001");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(await chCallsFor(ALICE)).toBe(1);
  });

  it("stops at the user's daily cap without calling Companies House", async () => {
    vi.stubEnv("REDSTRING_CH_CALLS_PER_USER_DAY", "1");
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, { fetch, cache: createCache(60_000) });

    await s.ch.getCompany("OC000001");
    await expect(s.ch.getOfficers("OC000001")).rejects.toMatchObject({
      name: "CapError",
      kind: "ch-call",
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(await chCallsFor(ALICE)).toBe(1);
  });

  it("the shared five-minute budget refuses once spent and records nothing for the refused call", async () => {
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, {
      fetch,
      cache: createCache(60_000),
      sharedMax: 1,
      now: () => 1_000_000,
    });

    await s.ch.getCompany("OC000001");
    await expect(s.ch.getOfficers("OC000001")).rejects.toMatchObject({
      name: "SourceError",
      kind: "rate_limited",
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(await chCallsFor(ALICE)).toBe(1);
  });

  it("the kill switch stops Companies House calls", async () => {
    vi.stubEnv("REDSTRING_KILL_SWITCH", "1");
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, { fetch, cache: createCache(60_000) });

    await expect(s.ch.getCompany("OC000001")).rejects.toMatchObject({
      kind: "kill-switch",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("without keys the clients say so and nothing is recorded", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "");
    vi.stubEnv("REDSTRING_SEC_USER_AGENT", "");
    const { fetch, fn } = chFetch();
    const s = buildSources(ALICE, { fetch, cache: createCache(60_000) });

    await expect(s.ch.getCompany("OC000001")).rejects.toMatchObject({ kind: "no_key" });
    await expect(s.sec.findCompany("x")).rejects.toMatchObject({ kind: "no_key" });
    expect(fn).not.toHaveBeenCalled();
    expect(await chCallsFor(ALICE)).toBe(0);
  });

  it("builds all four clients", async () => {
    const s = buildSources(ALICE, { fetch: chFetch().fetch });
    expect(Object.keys(s).sort()).toEqual(["ch", "gleif", "icij", "sec"]);
  });
});
