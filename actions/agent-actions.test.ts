import type { ActionCaller, ActionRunContext } from "@agent-native/core/action";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../server/db/test-db.js";
import { ProvenanceError } from "../server/board/provenance.js";
import { LanguageError } from "../server/board/language.js";
import {
  createCase,
  listBoard,
  pinEdge,
  pinNode,
} from "../server/board/store.js";
import { CH_PUBLIC, ev, fakeSources, res } from "../server/board/test-sources.js";
import type { IcijCandidate } from "../server/sources/icij.js";
import type { Officer } from "../server/sources/companies-house.js";
import { SourceError } from "../server/sources/types.js";
import { CapError } from "../server/usage/caps.js";
import checkLeaks, { checkLeaksRun } from "./check-leaks.js";
import expandNode, { expandNodeRun } from "./expand-node.js";
import getBoard, { getBoardRun } from "./get-board.js";
import listCases, { listCasesRun } from "./list-cases.js";
import navigateToNode, { navigateToNodeRun } from "./navigate-to-node.js";
import searchEntity, { searchEntityRun } from "./search-entity.js";
import suggestReject, { suggestRejectRun } from "./suggest-reject.js";
import { viewScreenRun } from "./view-screen.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../server/db/index.js", () => ({
  getDb: () => testDb,
}));

const appState = vi.hoisted(() => ({
  written: [] as Array<{ key: string; value: unknown }>,
  read: {} as Record<string, unknown>,
}));
vi.mock("@agent-native/core/application-state", () => ({
  writeAppStateForCurrentTab: async (key: string, value: unknown) => {
    appState.written.push({ key, value });
  },
  readAppState: async (key: string) => appState.read[key],
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const ctx = (email = ALICE, caller: ActionCaller = "tool"): ActionRunContext => ({
  userEmail: email,
  caller,
});

const officer = (id: string, name: string): Officer => ({
  officerId: id,
  name,
  role: "director",
  corporate: false,
});

async function ukCase(owner = ALICE) {
  const c = await createCase(owner, "Laundromat shells");
  const company = await pinNode({
    caseId: c.id,
    ownerEmail: owner,
    type: "company",
    key: "OC000001",
    label: "ACME LLP",
    facts: { jurisdiction: "uk", type: "llp" },
    evidence: [ev("companies-house", "OC000001", `${CH_PUBLIC}/company/OC000001`)],
    actor: "person",
    status: "confirmed",
  });
  return { c, company };
}

const officersEv = () =>
  ev("companies-house", "OC000001", `${CH_PUBLIC}/company/OC000001/officers`);

beforeEach(async () => {
  appState.written = [];
  appState.read = {};
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

describe("expand-node", () => {
  it("by the agent creates only proposed items", async () => {
    const { c, company } = await ukCase();
    const sources = fakeSources({
      ch: {
        getOfficers: async () =>
          res([officer("ID_A", "SMITH, John"), officer("ID_B", "JONES, Ann")], officersEv()),
      },
    });

    const out = await expandNodeRun(
      { caseId: c.id, nodeId: company.id, include: ["officers"] },
      ctx(),
      { sources },
    );

    expect(out).toMatchObject({ pinnedNodes: 2, pinnedEdges: 2 });
    const board = await listBoard(c.id, ALICE);
    const added = board.nodes.filter((n) => n.id !== company.id);
    expect(added).toHaveLength(2);
    expect(added.every((n) => n.status === "proposed" && n.addedBy === "agent")).toBe(true);
    expect(board.edges.every((e) => e.status === "proposed" && e.addedBy === "agent")).toBe(true);
    expect(board.nodes.find((n) => n.id === company.id)?.status).toBe("confirmed");
    expect(board.activity.at(-1)).toMatchObject({
      kind: "expand",
      actor: "agent",
      caller: "tool",
      targetId: company.id,
    });
  });

  it("an expansion that would pin without evidence returns a ProvenanceError and writes an activity row", async () => {
    const { c, company } = await ukCase();
    const sources = fakeSources({
      ch: {
        getOfficers: async () =>
          res([officer("ID_A", "SMITH, John")], { ...officersEv(), contentHash: "" }),
      },
    });

    await expect(
      expandNodeRun({ caseId: c.id, nodeId: company.id, include: ["officers"] }, ctx(), { sources }),
    ).rejects.toBeInstanceOf(ProvenanceError);

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes).toHaveLength(1);
    expect(board.activity.find((a) => a.kind === "expand-refused")).toMatchObject({
      actor: "agent",
      caller: "tool",
      targetId: company.id,
    });
    expect(board.activity.find((a) => a.kind === "expand-refused")?.detail).toContain("no_source");
  });

  it("expands a person through their appointments", async () => {
    const { c } = await ukCase();
    const person = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH_PUBLIC}/company/OC000001/officers`)],
      actor: "agent",
    });
    const sources = fakeSources({
      ch: {
        getAppointments: async () =>
          res(
            [{ companyNumber: "OC000002", companyName: "OTHER LLP", role: "director" }],
            ev("companies-house", "ID_A", `${CH_PUBLIC}/officers/ID_A/appointments`),
          ),
      },
    });

    const out = await expandNodeRun({ caseId: c.id, nodeId: person.id }, ctx(), { sources });

    expect(out).toMatchObject({ pinnedNodes: 1, pinnedEdges: 1 });
  });

  it("records a person as the actor when the UI calls it, and still pins only proposed items", async () => {
    const { c, company } = await ukCase();
    const sources = fakeSources({
      ch: { getOfficers: async () => res([officer("ID_A", "SMITH, John")], officersEv()) },
    });

    await expandNodeRun(
      { caseId: c.id, nodeId: company.id, include: ["officers"] },
      ctx(ALICE, "frontend"),
      { sources },
    );

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.find((n) => n.key === "ID_A")).toMatchObject({
      status: "proposed",
      addedBy: "person",
    });
    expect(board.activity.at(-1)).toMatchObject({ actor: "person", caller: "frontend" });
  });

  it("will not touch another owner's case", async () => {
    const { c, company } = await ukCase();
    await expect(
      expandNodeRun({ caseId: c.id, nodeId: company.id }, ctx(BOB), { sources: fakeSources() }),
    ).rejects.toMatchObject({ errorCode: "case_not_found", statusCode: 404 });
  });

  it("needs a signed-in user", async () => {
    const { c, company } = await ukCase();
    await expect(
      expandNodeRun(
        { caseId: c.id, nodeId: company.id },
        { caller: "tool" },
        { sources: fakeSources() },
      ),
    ).rejects.toMatchObject({ errorCode: "not_signed_in", statusCode: 401 });
  });
});

describe("check-leaks", () => {
  it("pins Offshore Leaks candidates for the node and writes an activity row", async () => {
    const { c, company } = await ukCase();
    const reconcile = vi.fn(async () =>
      res<IcijCandidate[]>(
        [
          {
            id: "1001",
            name: "ACME LLP",
            score: 92,
            matched: false,
            description: "Entity in the Panama Papers",
            url: "https://offshoreleaks.icij.org/nodes/1001",
          },
        ],
        ev("icij", "acme", "https://offshoreleaks.icij.org/api/v1/reconcile"),
      ),
    );

    const out = await checkLeaksRun({ caseId: c.id, nodeId: company.id }, ctx(), {
      sources: fakeSources({ icij: { reconcile } }),
    });

    expect(out).toMatchObject({ pinnedNodes: 1, pinnedEdges: 1 });
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.find((n) => n.key === "icij:1001")?.status).toBe("proposed");
    expect(board.activity.at(-1)).toMatchObject({ kind: "check-leaks", caller: "tool" });
  });
});

describe("search-entity", () => {
  it("returns hits and pins nothing", async () => {
    const out = await searchEntityRun(
      { query: "lcm", jurisdiction: "uk" },
      ctx(),
      {
        sources: fakeSources({
          ch: {
            searchCompanies: async () =>
              res(
                [{ number: "OC372263", name: "LCM ALLIANCE LLP" }],
                ev("companies-house", "search:lcm", `${CH_PUBLIC}/search/companies?q=lcm`),
              ),
          },
        }),
      },
    );

    expect(out.hits).toEqual([
      {
        jurisdiction: "uk",
        source: "companies-house",
        key: "OC372263",
        name: "LCM ALLIANCE LLP",
      },
    ]);
  });

  it("turns a spent daily limit into a plain 429, and a source outage into a 502", async () => {
    const limited = fakeSources({
      ch: {
        searchCompanies: async () => {
          throw new CapError("ch-call");
        },
      },
    });
    await expect(
      searchEntityRun({ query: "x", jurisdiction: "uk" }, ctx(), { sources: limited }),
    ).rejects.toMatchObject({
      errorCode: "limit_reached",
      statusCode: 429,
      message: "Daily limit reached. Try again tomorrow.",
    });

    const down = fakeSources({
      ch: {
        searchCompanies: async () => {
          throw new SourceError("companies-house", "timeout", "Companies House did not answer in time.");
        },
      },
    });
    await expect(
      searchEntityRun({ query: "x", jurisdiction: "uk" }, ctx(), { sources: down }),
    ).rejects.toMatchObject({ errorCode: "source_timeout", statusCode: 502 });
  });
});

describe("suggest-reject", () => {
  it('with the word "suspicious" is refused', async () => {
    const { c, company } = await ukCase();

    await expect(
      suggestRejectRun(
        { caseId: c.id, targetId: company.id, reason: "This looks suspicious to me" },
        ctx(),
      ),
    ).rejects.toBeInstanceOf(LanguageError);

    expect((await listBoard(c.id, ALICE)).suggestions).toHaveLength(0);
  });

  it("leaves status unchanged and records an open suggestion", async () => {
    const { c, company } = await ukCase();

    const s = await suggestRejectRun(
      {
        caseId: c.id,
        targetId: company.id,
        reason: "The register shows a different incorporation date than the article.",
      },
      ctx(),
    );

    expect(s).toMatchObject({ targetId: company.id, status: "open" });
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.find((n) => n.id === company.id)?.status).toBe("confirmed");
    expect(board.suggestions).toHaveLength(1);
    expect(board.activity.at(-1)).toMatchObject({
      kind: "suggest-reject",
      actor: "agent",
      targetId: company.id,
    });
  });

  it("can point at a link as well as a node, but not at something outside the case", async () => {
    const { c, company } = await ukCase();
    const other = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH_PUBLIC}/company/OC000001/officers`)],
      actor: "agent",
    });
    const e = await pinEdge({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "officer-of",
      fromId: other.id,
      toId: company.id,
      evidence: [ev("companies-house", "ID_A", `${CH_PUBLIC}/company/OC000001/officers`)],
      actor: "agent",
    });

    await expect(
      suggestRejectRun({ caseId: c.id, targetId: e.id, reason: "Different person of the same name." }, ctx()),
    ).resolves.toMatchObject({ targetId: e.id });
    await expect(
      suggestRejectRun({ caseId: c.id, targetId: "nope", reason: "Different person." }, ctx()),
    ).rejects.toMatchObject({ errorCode: "target_not_found" });
  });
});

describe("get-board", () => {
  it("refuses a case owned by someone else", async () => {
    const { c } = await ukCase();
    await expect(getBoardRun({ caseId: c.id }, ctx(BOB))).rejects.toMatchObject({
      errorCode: "case_not_found",
      statusCode: 404,
    });
  });

  it("names the case, so a screen opened straight on it can show its title", async () => {
    const { c } = await ukCase();
    const out = await getBoardRun({ caseId: c.id }, ctx());
    expect(out).toMatchObject({ caseId: c.id, title: "Laundromat shells" });
  });

  it("includes observations", async () => {
    const { c, company } = await ukCase();
    const second = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "OC000002",
      label: "OTHER LLP",
      facts: { jurisdiction: "uk" },
      evidence: [ev("companies-house", "OC000002", `${CH_PUBLIC}/company/OC000002`)],
      actor: "agent",
    });
    const where = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "address",
      key: "10 high street potters bar en6 1aa",
      label: "10 High Street, Potters Bar, EN6 1AA",
      facts: {},
      evidence: [ev("companies-house", "OC000001", `${CH_PUBLIC}/company/OC000001`)],
      actor: "agent",
    });
    for (const from of [company, second]) {
      await pinEdge({
        caseId: c.id,
        ownerEmail: ALICE,
        type: "registered-at",
        fromId: from.id,
        toId: where.id,
        evidence: [ev("companies-house", from.key, `${CH_PUBLIC}/company/${from.key}`)],
        actor: "agent",
      });
    }

    const out = await getBoardRun({ caseId: c.id }, ctx());

    expect(out.nodes).toHaveLength(3);
    expect(out.observations).toMatchObject([{ kind: "shared-address", count: 2 }]);
  });
});

describe("list-cases", () => {
  it("lists the caller's own cases with counts and never another owner's", async () => {
    const mine = await ukCase(ALICE);
    await ukCase(BOB);

    const rows = await listCasesRun({}, ctx(ALICE));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: mine.c.id, title: "Laundromat shells", items: 1, proposed: 0 });
    expect(JSON.stringify(rows)).not.toContain(BOB);
  });

  it("needs a signed-in caller", async () => {
    await expect(listCasesRun({}, { caller: "tool" } as ActionRunContext)).rejects.toMatchObject({
      errorCode: "not_signed_in",
    });
  });
});

describe("navigate-to-node", () => {
  it("writes a navigate command for a node in the person's own case", async () => {
    const { c, company } = await ukCase();

    await navigateToNodeRun({ caseId: c.id, nodeId: company.id }, ctx());

    expect(appState.written).toHaveLength(1);
    expect(appState.written[0]).toMatchObject({
      key: "navigate",
      value: { view: "case", caseId: c.id, nodeId: company.id },
    });
  });

  it("will not point the screen at a node that is not in the case", async () => {
    const { c } = await ukCase();
    await expect(
      navigateToNodeRun({ caseId: c.id, nodeId: "nope" }, ctx()),
    ).rejects.toMatchObject({ errorCode: "node_not_found" });
    expect(appState.written).toHaveLength(0);
  });
});

describe("view-screen", () => {
  it("also returns the open case id", async () => {
    appState.read.navigation = { view: "case", caseId: "case-1", nodeId: "n1" };
    appState.read.selection = { nodeIds: ["n1"] };

    const out = (await viewScreenRun()) as Record<string, unknown>;

    expect(out).toMatchObject({
      openCaseId: "case-1",
      navigation: { view: "case", caseId: "case-1" },
      selection: { nodeIds: ["n1"] },
    });
  });

  it("has no open case on other screens", async () => {
    appState.read.navigation = { view: "home" };
    const out = (await viewScreenRun()) as Record<string, unknown>;
    expect(out.openCaseId).toBeUndefined();
  });
});

describe("how the actions are exposed", () => {
  const entries = {
    "search-entity": searchEntity,
    "expand-node": expandNode,
    "check-leaks": checkLeaks,
    "suggest-reject": suggestReject,
    "get-board": getBoard,
    "list-cases": listCases,
    "navigate-to-node": navigateToNode,
  } as Record<string, any>;

  it("reads are GET and read-only, writes are POST, and none is UI-only", () => {
    expect(entries["search-entity"]).toMatchObject({ http: { method: "GET" }, mcpTool: true });
    expect(entries["get-board"]).toMatchObject({
      http: { method: "GET" },
      readOnly: true,
      mcpTool: true,
    });
    expect(entries["list-cases"]).toMatchObject({
      http: { method: "GET" },
      readOnly: true,
      mcpTool: true,
    });
    expect(entries["expand-node"].http).toEqual({ method: "POST" });
    expect(entries["check-leaks"].http).toEqual({ method: "POST" });
    expect(entries["navigate-to-node"].http).toBe(false);
    for (const [name, entry] of Object.entries(entries)) {
      expect(entry.uiOnly, name).not.toBe(true);
    }
  });
});
