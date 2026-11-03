import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import {
  addChange,
  addSuggestion,
  createCase,
  listBoard,
  logActivity,
  moveNode,
  pinEdge,
  pinNode,
  setCoverage,
  setStatus,
} from "./store.js";
import type { EvidenceInput } from "./types.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

function evidence(n = 1): EvidenceInput {
  return {
    source: "companies-house",
    url: `https://find-and-update.company-information.service.gov.uk/company/OC37226${n}`,
    recordId: `OC37226${n}`,
    retrievedAt: "2026-11-03T10:00:00.000Z",
    contentHash: `hash-${n}`,
  };
}

async function caseWithCompany(owner = ALICE) {
  const c = await createCase(owner, "Laundromat shells");
  const node = await pinNode({
    caseId: c.id,
    ownerEmail: owner,
    type: "company",
    key: "OC372263",
    label: "LCM ALLIANCE LLP",
    facts: { status: "dissolved" },
    evidence: [evidence(1)],
    actor: "agent",
  });
  return { c, node };
}

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

describe("board store", () => {
  it("pins a node with evidence", async () => {
    const { c, node } = await caseWithCompany();

    expect(node.status).toBe("proposed");
    expect(node.addedBy).toBe("agent");
    expect(node.facts).toEqual({ status: "dissolved" });
    expect(node.evidence).toHaveLength(1);
    expect(node.evidence[0]).toMatchObject({
      source: "companies-house",
      recordId: "OC372261",
      contentHash: "hash-1",
    });

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]?.label).toBe("LCM ALLIANCE LLP");
  });

  it("a second pin of the same key adds evidence and keeps one node", async () => {
    const { c, node } = await caseWithCompany();

    const again = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "OC372263",
      label: "LCM ALLIANCE LLP",
      facts: {},
      evidence: [evidence(2)],
      actor: "agent",
    });

    expect(again.id).toBe(node.id);
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]?.evidence).toHaveLength(2);
  });

  it("refuses a pin that has no evidence", async () => {
    const c = await createCase(ALICE, "Case");
    await expect(
      pinNode({
        caseId: c.id,
        ownerEmail: ALICE,
        type: "company",
        key: "OC1",
        label: "X",
        facts: {},
        evidence: [],
        actor: "agent",
      }),
    ).rejects.toThrow(/no_source/);
    expect((await listBoard(c.id, ALICE)).nodes).toHaveLength(0);
  });

  it("listBoard never returns another owner's rows", async () => {
    const { c } = await caseWithCompany(ALICE);
    const bobsCase = await createCase(BOB, "Bob's case");

    expect((await listBoard(bobsCase.id, BOB)).nodes).toHaveLength(0);
    await expect(listBoard(c.id, BOB)).rejects.toThrow(/case_not_found/);
  });

  it("refuses to pin into a case owned by someone else", async () => {
    const { c } = await caseWithCompany(ALICE);
    await expect(
      pinNode({
        caseId: c.id,
        ownerEmail: BOB,
        type: "company",
        key: "OC2",
        label: "Intruder",
        facts: {},
        evidence: [evidence(3)],
        actor: "person",
      }),
    ).rejects.toThrow(/case_not_found/);
  });

  it("setStatus writes an activity row with the actor", async () => {
    const { c, node } = await caseWithCompany();

    await setStatus({
      caseId: c.id,
      ownerEmail: ALICE,
      targetKind: "node",
      targetId: node.id,
      to: "confirmed",
      actor: "person",
    });

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]?.status).toBe("confirmed");
    const row = board.activity.find((a) => a.kind === "set-status");
    expect(row).toMatchObject({ actor: "person", targetId: node.id });
  });

  it("setStatus stores the reason for a rejection", async () => {
    const { c, node } = await caseWithCompany();

    await setStatus({
      caseId: c.id,
      ownerEmail: ALICE,
      targetKind: "node",
      targetId: node.id,
      to: "rejected",
      reason: "Different company with the same name",
      actor: "person",
    });

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]).toMatchObject({
      status: "rejected",
      reason: "Different company with the same name",
    });
  });

  it("moveNode persists x and y", async () => {
    const { c, node } = await caseWithCompany();

    await moveNode(c.id, ALICE, node.id, 120.5, -40);

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]).toMatchObject({ x: 120.5, y: -40 });
  });

  it("setCoverage upserts by source", async () => {
    const { c } = await caseWithCompany();

    await setCoverage(c.id, ALICE, {
      source: "icij",
      state: "searched",
      note: "searching",
    });
    await setCoverage(c.id, ALICE, {
      source: "icij",
      state: "no_match",
      note: "no match in Offshore Leaks",
    });
    await setCoverage(c.id, ALICE, {
      source: "gleif",
      state: "no_match",
      note: "no LEI found",
    });

    const board = await listBoard(c.id, ALICE);
    expect(board.coverage).toHaveLength(2);
    expect(board.coverage.find((r) => r.source === "icij")).toEqual({
      source: "icij",
      state: "no_match",
      note: "no match in Offshore Leaks",
    });
  });

  it("pinEdge joins two nodes of the case and keeps its evidence", async () => {
    const { c, node } = await caseWithCompany();
    const member = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "SC1",
      label: "SEYCHELLES MEMBER LTD",
      facts: {},
      evidence: [evidence(4)],
      actor: "agent",
    });

    const edge = await pinEdge({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "member-of",
      fromId: member.id,
      toId: node.id,
      evidence: [evidence(5)],
      actor: "agent",
    });

    expect(edge.status).toBe("proposed");
    const board = await listBoard(c.id, ALICE);
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]?.evidence).toHaveLength(1);
  });

  it("pinEdge refuses a node that is not in the case", async () => {
    const { c, node } = await caseWithCompany();
    await expect(
      pinEdge({
        caseId: c.id,
        ownerEmail: ALICE,
        type: "member-of",
        fromId: "no-such-node",
        toId: node.id,
        evidence: [evidence(5)],
        actor: "agent",
      }),
    ).rejects.toThrow(/node_not_found/);
  });

  it("addSuggestion stores an open suggestion and leaves the status alone", async () => {
    const { c, node } = await caseWithCompany();

    const s = await addSuggestion(c.id, ALICE, node.id, "Name matches a different company");

    expect(s.status).toBe("open");
    const board = await listBoard(c.id, ALICE);
    expect(board.suggestions).toEqual([
      { id: s.id, targetId: node.id, reason: "Name matches a different company", status: "open" },
    ]);
    expect(board.nodes[0]?.status).toBe("proposed");
  });

  it("addChange stores a pending change for the owner's case", async () => {
    const { c } = await caseWithCompany();

    const change = await addChange(ALICE, {
      caseId: c.id,
      watchId: "watch-1",
      kind: "filings",
      summary: "2 new filings",
    });

    expect(change.status).toBe("pending");
    const board = await listBoard(c.id, ALICE);
    expect(board.changes).toHaveLength(1);
    expect(board.changes[0]?.summary).toBe("2 new filings");
    await expect(
      addChange(BOB, { caseId: c.id, watchId: "w", kind: "filings", summary: "x" }),
    ).rejects.toThrow(/case_not_found/);
  });

  it("logActivity records who did what", async () => {
    const { c } = await caseWithCompany();

    await logActivity({
      caseId: c.id,
      ownerEmail: ALICE,
      actor: "agent",
      caller: "tool",
      kind: "expand-node",
      detail: "pinned 3 officers",
    });

    const board = await listBoard(c.id, ALICE);
    expect(board.activity.find((a) => a.kind === "expand-node")).toMatchObject({
      actor: "agent",
      caller: "tool",
      detail: "pinned 3 officers",
    });
  });
});

describe("board store enforces provenance", () => {
  it("pinNode refuses evidence whose URL is not https", async () => {
    const c = await createCase(ALICE, "Case");
    await expect(
      pinNode({
        caseId: c.id,
        ownerEmail: ALICE,
        type: "company",
        key: "OC1",
        label: "X",
        facts: {},
        evidence: [{ ...evidence(1), url: "http://example.com/x" }],
        actor: "agent",
      }),
    ).rejects.toMatchObject({ code: "bad_url" });
    expect((await listBoard(c.id, ALICE)).nodes).toHaveLength(0);
  });

  it("an agent cannot pin a node as confirmed", async () => {
    const c = await createCase(ALICE, "Case");
    await expect(
      pinNode({
        caseId: c.id,
        ownerEmail: ALICE,
        type: "company",
        key: "OC1",
        label: "X",
        facts: {},
        evidence: [evidence(1)],
        actor: "agent",
        status: "confirmed",
      }),
    ).rejects.toMatchObject({ code: "agent_not_allowed" });
    expect((await listBoard(c.id, ALICE)).nodes).toHaveLength(0);
  });

  it("a person can pin a node as confirmed", async () => {
    const c = await createCase(ALICE, "Case");
    const node = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "OC1",
      label: "X",
      facts: {},
      evidence: [evidence(1)],
      actor: "person",
      status: "confirmed",
    });
    expect(node.status).toBe("confirmed");
  });

  it("setStatus refuses an agent confirming and leaves the status alone", async () => {
    const { c, node } = await caseWithCompany();
    await expect(
      setStatus({
        caseId: c.id,
        ownerEmail: ALICE,
        targetKind: "node",
        targetId: node.id,
        to: "confirmed",
        actor: "agent",
      }),
    ).rejects.toMatchObject({ code: "agent_not_allowed" });
    expect((await listBoard(c.id, ALICE)).nodes[0]?.status).toBe("proposed");
  });

  it("setStatus refuses a rejection without a reason", async () => {
    const { c, node } = await caseWithCompany();
    await expect(
      setStatus({
        caseId: c.id,
        ownerEmail: ALICE,
        targetKind: "node",
        targetId: node.id,
        to: "rejected",
        actor: "person",
      }),
    ).rejects.toMatchObject({ code: "reason_required" });
    expect((await listBoard(c.id, ALICE)).nodes[0]?.status).toBe("proposed");
  });
});
