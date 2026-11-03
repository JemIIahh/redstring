import type { ActionCaller, ActionRunContext } from "@agent-native/core/action";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotWatchesRun } from "../../actions/snapshot-watches.js";
import { createTestDb, type TestDb } from "../db/test-db.js";
import {
  addWatch,
  createCase,
  latestSnapshot,
  listBoard,
  listChanges,
  pinNode,
  saveSnapshot,
} from "../board/store.js";
import type { Snapshot } from "../board/types.js";
import { CH_PUBLIC, ev, fakeSources, res } from "../board/test-sources.js";
import type { Controller, Filing, Officer } from "../sources/companies-house.js";
import type { Sources } from "../sources/registry.js";
import { SourceError } from "../sources/types.js";
import { CapError } from "../usage/caps.js";
import { diffSnapshots, takeSnapshot } from "./snapshot.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const ctx = (email = ALICE, caller: ActionCaller = "automation"): ActionRunContext => ({
  userEmail: email,
  caller,
});

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

const officer = (id: string, over: Partial<Officer> = {}): Officer => ({
  officerId: id,
  name: `NAME ${id}`,
  role: "director",
  appointedOn: "2020-01-01",
  corporate: false,
  ...over,
});

const controller = (id: string, over: Partial<Controller> = {}): Controller => ({
  id,
  name: `CONTROLLER ${id}`,
  kind: "individual-person-with-significant-control",
  notifiedOn: "2020-01-01",
  natures: ["ownership-of-shares-25-to-50-percent"],
  ...over,
});

const filing = (id: string): Filing => ({
  transactionId: id,
  date: "2026-10-01",
  category: "accounts",
  type: "AA",
  description: "accounts-with-accounts-type-full",
});

interface Register {
  officers: Officer[];
  controllers: Controller[];
  filings: Filing[];
  /** What the register says it holds in all, when that is more than the list returned. */
  filingTotal?: number;
}

/** A Companies House stand-in serving a register that tests can change between runs. */
function registerOf(initial: Register, calls: string[] = []) {
  const state = { ...initial };
  const at = (n: string, path: string) => ev("companies-house", n, `${CH_PUBLIC}/company/${n}/${path}`);
  const sources = fakeSources({
    ch: {
      getOfficers: async (n) => {
        calls.push(`officers:${n}`);
        return res(state.officers, at(n, "officers"));
      },
      getControllers: async (n) => {
        calls.push(`controllers:${n}`);
        return res(state.controllers, at(n, "persons-with-significant-control"));
      },
      getFilings: async (n) => {
        calls.push(`filings:${n}`);
        const total = state.filingTotal;
        return res(state.filings, at(n, "filing-history"), total ? { total } : {});
      },
    },
  });
  return { state, sources };
}

const base = (): Register => ({
  officers: [officer("A"), officer("B")],
  controllers: [controller("P1")],
  filings: [filing("T1"), filing("T2")],
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  officersHash: "o1",
  controllersHash: "c1",
  filingsHash: "f1",
  filingCount: 2,
  takenAt: "2026-11-03T10:00:00.000Z",
  ...over,
});

describe("diffSnapshots", () => {
  it("identical inputs give no changes", () => {
    expect(diffSnapshots(snap(), snap({ takenAt: "2026-11-04T10:00:00.000Z" }))).toEqual([]);
  });

  it('one new filing gives "1 new filing"', () => {
    expect(diffSnapshots(snap(), snap({ filingsHash: "f2", filingCount: 3 }))).toEqual([
      { kind: "filings", summary: "1 new filing" },
    ]);
  });

  it("says how many when there are several new filings", () => {
    expect(diffSnapshots(snap(), snap({ filingsHash: "f2", filingCount: 5 }))).toEqual([
      { kind: "filings", summary: "3 new filings" },
    ]);
  });

  it("a changed filing list with no growth is reported without inventing a count", () => {
    const [change, ...rest] = diffSnapshots(snap(), snap({ filingsHash: "f2" }));
    expect(rest).toEqual([]);
    expect(change).toMatchObject({ kind: "filings" });
    expect(change?.summary).not.toMatch(/\d/);
  });

  it("reports officers and controllers separately", () => {
    expect(diffSnapshots(snap(), snap({ officersHash: "o2" })).map((c) => c.kind)).toEqual(["officers"]);
    expect(diffSnapshots(snap(), snap({ controllersHash: "c2" })).map((c) => c.kind)).toEqual([
      "controllers",
    ]);
    expect(
      diffSnapshots(snap(), snap({ officersHash: "o2", controllersHash: "c2", filingsHash: "f2" })).map(
        (c) => c.kind,
      ),
    ).toEqual(["officers", "controllers", "filings"]);
  });
});

describe("takeSnapshot", () => {
  const now = () => new Date("2026-11-03T10:00:00.000Z");

  it("reads officers, controllers and filings once each and stamps the time", async () => {
    const calls: string[] = [];
    const { sources } = registerOf(base(), calls);

    const s = await takeSnapshot(sources, "OC000001", { now });

    expect(calls.sort()).toEqual(["controllers:OC000001", "filings:OC000001", "officers:OC000001"]);
    expect(s).toMatchObject({ takenAt: "2026-11-03T10:00:00.000Z", filingCount: 2 });
    for (const h of [s.officersHash, s.controllersHash, s.filingsHash]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("the same register gives the same snapshot, whatever order it lists things in", async () => {
    const a = registerOf(base());
    const reordered = base();
    reordered.officers.reverse();
    reordered.filings.reverse();
    const b = registerOf(reordered);

    const first = await takeSnapshot(a.sources, "OC000001", { now });
    const second = await takeSnapshot(b.sources, "OC000001", { now });

    expect(second).toEqual(first);
    expect(diffSnapshots(first, second)).toEqual([]);
  });

  it("an officer resigning changes officersHash and reports an officers change", async () => {
    const { state, sources } = registerOf(base());
    const before = await takeSnapshot(sources, "OC000001", { now });

    state.officers = [officer("A"), officer("B", { resignedOn: "2026-10-30" })];
    const after = await takeSnapshot(sources, "OC000001", { now });

    expect(after.officersHash).not.toBe(before.officersHash);
    expect(after.controllersHash).toBe(before.controllersHash);
    expect(after.filingsHash).toBe(before.filingsHash);
    expect(diffSnapshots(before, after).map((c) => c.kind)).toEqual(["officers"]);
  });

  it("a new person with significant control is a controllers change", async () => {
    const { state, sources } = registerOf(base());
    const before = await takeSnapshot(sources, "OC000001", { now });

    state.controllers = [controller("P1"), controller("P2")];
    const after = await takeSnapshot(sources, "OC000001", { now });

    expect(diffSnapshots(before, after).map((c) => c.kind)).toEqual(["controllers"]);
  });

  it("counts filings from the register's total when the list is cut short", async () => {
    const { state, sources } = registerOf({ ...base(), filingTotal: 120 });
    const before = await takeSnapshot(sources, "OC000001", { now });
    expect(before.filingCount).toBe(120);

    // The list is capped, so a new filing pushes the oldest one out: same length, new head.
    state.filings = [filing("T0"), filing("T1")];
    state.filingTotal = 121;
    const after = await takeSnapshot(sources, "OC000001", { now });

    expect(diffSnapshots(before, after)).toEqual([{ kind: "filings", summary: "1 new filing" }]);
  });

  it("a read that fails fails the whole snapshot", async () => {
    const sources = fakeSources({
      ch: {
        getOfficers: async () => {
          throw new SourceError("companies-house", "timeout", "Companies House did not answer in time.");
        },
        getControllers: async () => res([], ev("companies-house", "x", `${CH_PUBLIC}/x`)),
        getFilings: async () => res([], ev("companies-house", "x", `${CH_PUBLIC}/x`)),
      },
    });

    await expect(takeSnapshot(sources, "OC000001", { now })).rejects.toMatchObject({ kind: "timeout" });
  });
});

/** A case with a watched UK company. */
async function watched(owner: string, number: string) {
  const c = await createCase(owner, `Case ${number}`);
  const node = await pinNode({
    caseId: c.id,
    ownerEmail: owner,
    type: "company",
    key: number,
    label: `COMPANY ${number} LLP`,
    facts: { jurisdiction: "uk" },
    evidence: [ev("companies-house", number, `${CH_PUBLIC}/company/${number}`)],
    actor: "person",
    status: "confirmed",
  });
  const watch = await addWatch(c.id, owner, node.id, number);
  return { c, node, watch };
}

describe("snapshots in the store", () => {
  it("latestSnapshot is the newest one for that watch, and only for its owner", async () => {
    const { watch } = await watched(ALICE, "OC000001");
    await saveSnapshot(ALICE, watch.id, snap({ takenAt: "2026-11-01T10:00:00.000Z", filingsHash: "old" }));
    await saveSnapshot(ALICE, watch.id, snap({ takenAt: "2026-11-03T10:00:00.000Z", filingsHash: "new" }));

    expect(await latestSnapshot(ALICE, watch.id)).toMatchObject({ filingsHash: "new" });
    expect(await latestSnapshot(BOB, watch.id)).toBeUndefined();
    expect(await latestSnapshot(ALICE, "no-such-watch")).toBeUndefined();
  });

  it("saveSnapshot refuses somebody else's watch and writes nothing", async () => {
    const { watch } = await watched(ALICE, "OC000001");

    await expect(saveSnapshot(BOB, watch.id, snap())).rejects.toMatchObject({ code: "target_not_found" });

    expect(await latestSnapshot(ALICE, watch.id)).toBeUndefined();
  });
});

describe("snapshot-watches", () => {
  const now = () => new Date("2026-11-03T10:00:00.000Z");
  const run = (sources: Sources, email = ALICE, at = now) =>
    snapshotWatchesRun({}, ctx(email), { sources, now: at });

  it("the first run is a baseline: a snapshot, no changes", async () => {
    const { c, watch } = await watched(ALICE, "OC000001");
    const { sources } = registerOf(base());

    const out = await run(sources);

    expect(out).toMatchObject({ watches: 1, baselines: 1, changes: 0, failed: [] });
    expect(await latestSnapshot(ALICE, watch.id)).toMatchObject({ filingCount: 2 });
    expect(await listChanges(c.id, ALICE)).toEqual([]);
    expect((await listBoard(c.id, ALICE)).activity.slice(-1)[0]).toMatchObject({
      kind: "watch-baseline",
      actor: "agent",
      caller: "automation",
      targetId: watch.nodeId,
    });
  });

  it("a run with nothing new adds no changes but still records when it looked", async () => {
    const { c, watch } = await watched(ALICE, "OC000001");
    const { sources } = registerOf(base());
    await run(sources);

    const out = await run(sources, ALICE, () => new Date("2026-11-04T10:00:00.000Z"));

    expect(out).toMatchObject({ baselines: 0, changes: 0, unchanged: 1 });
    expect(await listChanges(c.id, ALICE)).toEqual([]);
    expect(await latestSnapshot(ALICE, watch.id)).toMatchObject({ takenAt: "2026-11-04T10:00:00.000Z" });
  });

  it("a new filing becomes one pending change, and is not reported twice", async () => {
    const { c, watch } = await watched(ALICE, "OC000001");
    const { state, sources } = registerOf(base());
    await run(sources);

    state.filings = [filing("T3"), ...state.filings];
    const out = await run(sources, ALICE, () => new Date("2026-11-04T10:00:00.000Z"));

    expect(out).toMatchObject({ changes: 1, unchanged: 0 });
    expect(await listChanges(c.id, ALICE)).toMatchObject([
      { watchId: watch.id, kind: "filings", summary: "1 new filing", status: "pending" },
    ]);
    expect((await listBoard(c.id, ALICE)).activity.slice(-1)[0]).toMatchObject({
      kind: "watch-change",
      detail: "1 new filing",
    });

    await run(sources, ALICE, () => new Date("2026-11-05T10:00:00.000Z"));
    expect(await listChanges(c.id, ALICE)).toHaveLength(1);
  });

  it("snapshot-watches only touches the caller's watches", async () => {
    const mine = await watched(ALICE, "OC000001");
    const theirs = await watched(BOB, "OC000002");
    const calls: string[] = [];
    const { sources } = registerOf(base(), calls);

    const out = await run(sources, ALICE);

    expect(out.watches).toBe(1);
    expect(calls.every((c) => c.endsWith(":OC000001"))).toBe(true);
    expect(await latestSnapshot(ALICE, mine.watch.id)).toBeDefined();
    expect(await latestSnapshot(BOB, theirs.watch.id)).toBeUndefined();
  });

  it("one company that cannot be read does not stop the others, and stores nothing for itself", async () => {
    const bad = await watched(ALICE, "OC000001");
    const good = await watched(ALICE, "OC000002");
    const ok = registerOf(base()).sources;
    const sources = fakeSources({
      ch: {
        ...ok.ch,
        getOfficers: async (n, o) => {
          if (n === "OC000001") {
            throw new SourceError("companies-house", "timeout", "Companies House did not answer in time.");
          }
          return ok.ch.getOfficers(n, o);
        },
      },
    });

    const out = await run(sources);

    expect(out).toMatchObject({ watches: 2, baselines: 1, changes: 0 });
    expect(out.failed).toEqual([
      { companyNumber: "OC000001", reason: "Companies House did not answer in time." },
    ]);
    expect(await latestSnapshot(ALICE, bad.watch.id)).toBeUndefined();
    expect(await latestSnapshot(ALICE, good.watch.id)).toBeDefined();
  });

  it("a spent daily limit stops the run, says so, and does not throw", async () => {
    const first = await watched(ALICE, "OC000001");
    const second = await watched(ALICE, "OC000002");
    const sources = fakeSources({
      ch: {
        getOfficers: async () => {
          throw new CapError("ch-call");
        },
      },
    });

    const out = await run(sources);

    expect(out.stoppedEarly).toBe("Daily limit reached. Try again tomorrow.");
    expect(out.baselines).toBe(0);
    expect(out.notChecked).toEqual(["OC000001", "OC000002"]);
    expect(await latestSnapshot(ALICE, first.watch.id)).toBeUndefined();
    expect(await latestSnapshot(ALICE, second.watch.id)).toBeUndefined();
  });

  it("with no watches there is nothing to do", async () => {
    await expect(run(fakeSources())).resolves.toMatchObject({
      watches: 0,
      baselines: 0,
      changes: 0,
      failed: [],
    });
  });
});
