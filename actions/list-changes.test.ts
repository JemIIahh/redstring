import type { ActionCaller, ActionRunContext } from "@agent-native/core/action";
import { actionsToEngineTools } from "@agent-native/core/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../server/db/test-db.js";
import { addWatch, createCase, pinNode, reviewChange, listChanges } from "../server/board/store.js";
import { CH_PUBLIC, ev, fakeSources, res } from "../server/board/test-sources.js";
import type { Filing } from "../server/sources/companies-house.js";
import listChangesAction, { listChangesRun } from "./list-changes.js";
import { snapshotWatchesRun } from "./snapshot-watches.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../server/db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const ctx = (email = ALICE, caller: ActionCaller = "tool"): ActionRunContext => ({
  userEmail: email,
  caller,
});

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

const filing = (id: string): Filing => ({
  transactionId: id,
  date: "2026-10-01",
  category: "accounts",
  type: "AA",
  description: "accounts-with-accounts-type-full",
});

/** A case with one watched UK company whose filing list tests can change between checks. */
async function watchedCompany(owner = ALICE, number = "OC000001") {
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

  const state = { filings: [filing("T1"), filing("T2")] };
  const at = (n: string, path: string) => ev("companies-house", n, `${CH_PUBLIC}/company/${n}/${path}`);
  const sources = fakeSources({
    ch: {
      getOfficers: async (n) => res([], at(n, "officers")),
      getControllers: async (n) => res([], at(n, "persons-with-significant-control")),
      getFilings: async (n) => res(state.filings, at(n, "filing-history")),
    },
  });
  const check = (owner2 = owner, when = "2026-11-03T10:00:00.000Z") =>
    snapshotWatchesRun({}, ctx(owner2, "automation"), { sources, now: () => new Date(when) });
  return { c, node, watch, state, check };
}

describe("list-changes", () => {
  it("list-changes returns a new-filing change after a second snapshot differs", async () => {
    const { c, node, watch, state, check } = await watchedCompany();
    await check(ALICE, "2026-11-03T10:00:00.000Z");
    state.filings = [filing("T3"), ...state.filings];
    await check(ALICE, "2026-11-04T10:00:00.000Z");

    const out = await listChangesRun({ caseId: c.id }, ctx());

    // Each change says which company it is about: "1 new filing" alone means nothing.
    expect(out.changes).toMatchObject([
      {
        watchId: watch.id,
        kind: "filings",
        summary: "1 new filing",
        status: "pending",
        nodeId: node.id,
        companyNumber: "OC000001",
      },
    ]);
    expect(out.watching).toBe(1);
    expect(out.watchedNodeIds).toEqual([node.id]);
    expect(out.lastCheckedAt).toBe("2026-11-04T10:00:00.000Z");
  });

  it("with no differences it returns an empty list and says when it last looked", async () => {
    const { c, check } = await watchedCompany();
    await check(ALICE, "2026-11-03T10:00:00.000Z");
    await check(ALICE, "2026-11-05T10:00:00.000Z");

    const out = await listChangesRun({ caseId: c.id }, ctx());

    expect(out.changes).toEqual([]);
    expect(out.lastCheckedAt).toBe("2026-11-05T10:00:00.000Z");
  });

  it("does not claim a check that never happened: no watches, or watches never read, have no date", async () => {
    const none = await createCase(ALICE, "Nothing watched");
    expect(await listChangesRun({ caseId: none.id }, ctx())).toEqual({
      changes: [],
      watching: 0,
      watchedNodeIds: [],
      lastCheckedAt: null,
    });

    const { c, node } = await watchedCompany(ALICE, "OC000002");
    expect(await listChangesRun({ caseId: c.id }, ctx())).toEqual({
      changes: [],
      watching: 1,
      watchedNodeIds: [node.id],
      lastCheckedAt: null,
    });
  });

  it("lists only the changes still waiting: an accepted or dismissed one is gone", async () => {
    const { c, state, check } = await watchedCompany();
    await check(ALICE, "2026-11-03T10:00:00.000Z");
    state.filings = [filing("T3"), ...state.filings];
    await check(ALICE, "2026-11-04T10:00:00.000Z");
    const [change] = await listChanges(c.id, ALICE);
    await reviewChange(c.id, ALICE, change!.id, "dismissed");

    const out = await listChangesRun({ caseId: c.id }, ctx());

    expect(out.changes).toEqual([]);
    // The check still happened, so the date stays.
    expect(out.lastCheckedAt).toBe("2026-11-04T10:00:00.000Z");
  });

  it("reads only the caller's case: someone else's case is not found", async () => {
    const { c } = await watchedCompany(ALICE);
    await expect(listChangesRun({ caseId: c.id }, ctx(BOB))).rejects.toMatchObject({
      errorCode: "case_not_found",
      statusCode: 404,
    });
  });

  it("needs a signed-in caller", async () => {
    const { c } = await watchedCompany();
    await expect(listChangesRun({ caseId: c.id }, { caller: "tool" })).rejects.toMatchObject({
      errorCode: "not_signed_in",
    });
  });

  it("is a read the agent may call and the person's screen may poll, and changes nothing", () => {
    const tools = actionsToEngineTools({ "list-changes": listChangesAction } as never);
    expect(tools.map((t) => t.name)).toContain("list-changes");
    expect(listChangesAction.readOnly).toBe(true);
    expect(listChangesAction.http).toMatchObject({ method: "GET" });
    expect(listChangesAction.uiOnly).not.toBe(true);
  });
});
