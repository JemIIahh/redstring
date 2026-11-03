import type { ActionCaller, ActionRunContext } from "@agent-native/core/action";
import {
  isActionExposedToExternalAgents,
  isActionHiddenFromEveryAgentSurface,
} from "@agent-native/core/action";
import { actionsToEngineTools } from "@agent-native/core/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cases, usage } from "../server/db/schema.js";
import { createTestDb, type TestDb } from "../server/db/test-db.js";
import {
  addChange,
  addSuggestion,
  addWatch,
  createCase,
  listBoard,
  listChanges,
  listWatches,
  pinNode,
} from "../server/board/store.js";
import { CH_PUBLIC, ev, fakeSources, res } from "../server/board/test-sources.js";
import type { CompanyProfile, Officer } from "../server/sources/companies-house.js";
import type { Sources } from "../server/sources/registry.js";
import { SourceError } from "../server/sources/types.js";
import annotate, { annotateRun } from "./annotate.js";
import createCaseAction, { createCaseRun } from "./create-case.js";
import { expandNodeRun } from "./expand-node.js";
import moveNode, { moveNodeRun } from "./move-node.js";
import pinItem, { pinItemRun } from "./pin-item.js";
import reviewChange, { reviewChangeRun } from "./review-change.js";
import reviewSuggestion, { reviewSuggestionRun } from "./review-suggestion.js";
import setStatus, { setStatusRun } from "./set-status.js";
import watchEntity, { watchEntityRun } from "./watch-entity.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../server/db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";

const ctx = (email = ALICE, caller: ActionCaller = "frontend"): ActionRunContext => ({
  userEmail: email,
  caller,
});

// Every way a call can arrive that is not the person's own screen. set-status
// is tried with all of them; the other actions with the three the brief names.
const NOT_THE_PERSON = ["tool", "http", "mcp", "a2a", "cli", "automation"] as const;
const AGENT_CALLERS = ["tool", "mcp", "a2a"] as const;

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await client.close();
});

/** A case with one UK company the agent proposed. */
async function proposedCompany(owner = ALICE) {
  const c = await createCase(owner, "Laundromat shells");
  const node = await pinNode({
    caseId: c.id,
    ownerEmail: owner,
    type: "company",
    key: "OC000001",
    label: "ACME LLP",
    facts: { jurisdiction: "uk", type: "llp" },
    evidence: [ev("companies-house", "OC000001", `${CH_PUBLIC}/company/OC000001`)],
    actor: "agent",
  });
  return { c, node };
}

const profile = (number: string, over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  number,
  name: `COMPANY ${number} LLP`,
  status: "active",
  type: "llp",
  address: "1 Test Street, London, EC1A 1AA",
  ...over,
});

/** Companies House stand-in that knows the given company numbers and counts its calls. */
function chKnowing(numbers: string[]) {
  const calls: string[] = [];
  const sources = fakeSources({
    ch: {
      getCompany: async (n) => {
        calls.push(n);
        if (!numbers.includes(n)) {
          throw new SourceError("companies-house", "not_found", `No company ${n}.`);
        }
        return res(profile(n), ev("companies-house", n, `${CH_PUBLIC}/company/${n}`));
      },
    },
  });
  return { sources, calls };
}

describe("set-status", () => {
  it.each(NOT_THE_PERSON)('refuses caller "%s"', async (caller) => {
    const { c, node } = await proposedCompany();

    await expect(
      setStatusRun(
        { caseId: c.id, targetKind: "node", targetId: node.id, to: "confirmed" },
        ctx(ALICE, caller),
      ),
    ).rejects.toMatchObject({ name: "ProvenanceError", code: "agent_not_allowed" });

    expect((await listBoard(c.id, ALICE)).nodes[0]?.status).toBe("proposed");
  });

  it('allows caller "frontend" and records actor person', async () => {
    const { c, node } = await proposedCompany();

    await setStatusRun(
      { caseId: c.id, targetKind: "node", targetId: node.id, to: "confirmed" },
      ctx(),
    );

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]?.status).toBe("confirmed");
    expect(board.activity.slice(-1)[0]).toMatchObject({
      kind: "set-status",
      actor: "person",
      caller: "frontend",
      targetId: node.id,
    });
  });

  it("rejected without a reason throws reason_required and changes nothing", async () => {
    const { c, node } = await proposedCompany();

    await expect(
      setStatusRun({ caseId: c.id, targetKind: "node", targetId: node.id, to: "rejected" }, ctx()),
    ).rejects.toMatchObject({ code: "reason_required" });

    expect((await listBoard(c.id, ALICE)).nodes[0]?.status).toBe("proposed");
  });

  it("rejected with a reason keeps the reason", async () => {
    const { c, node } = await proposedCompany();

    await setStatusRun(
      {
        caseId: c.id,
        targetKind: "node",
        targetId: node.id,
        to: "rejected",
        reason: "Different company with the same name.",
      },
      ctx(),
    );

    expect((await listBoard(c.id, ALICE)).nodes[0]).toMatchObject({
      status: "rejected",
      reason: "Different company with the same name.",
    });
  });

  it("reads another person's case as not found", async () => {
    const { c, node } = await proposedCompany();

    await expect(
      setStatusRun(
        { caseId: c.id, targetKind: "node", targetId: node.id, to: "confirmed" },
        ctx(BOB),
      ),
    ).rejects.toMatchObject({ errorCode: "case_not_found", statusCode: 404 });
  });
});

describe("create-case", () => {
  it("seeds are confirmed with person as actor, with the facts an expansion needs", async () => {
    const { sources } = chKnowing(["OC372263", "OC346224"]);

    const out = await createCaseRun(
      { title: "LCM", seeds: [{ companyNumber: "oc372263" }, { companyNumber: "OC346224" }] },
      ctx(),
      { sources },
    );

    const board = await listBoard(out.caseId, ALICE);
    expect(board.nodes.map((n) => n.key)).toEqual(["OC372263", "OC346224"]);
    for (const n of board.nodes) {
      expect(n).toMatchObject({ type: "company", status: "confirmed", addedBy: "person" });
      expect(n.facts).toMatchObject({
        jurisdiction: "uk",
        type: "llp",
        status: "active",
        address: "1 Test Street, London, EC1A 1AA",
        number: n.key,
      });
      expect(n.evidence).toHaveLength(1);
      expect(n.evidence[0]).toMatchObject({
        source: "companies-house",
        recordId: n.key,
        url: `${CH_PUBLIC}/company/${n.key}`,
      });
    }
    expect(board.activity.slice(-1)[0]).toMatchObject({
      kind: "create-case",
      actor: "person",
      caller: "frontend",
    });
  });

  it("a seed can be expanded straight away", async () => {
    const { sources } = chKnowing(["OC372263"]);
    const { caseId } = await createCaseRun(
      { title: "LCM", seeds: [{ companyNumber: "OC372263" }] },
      ctx(),
      { sources },
    );
    const seed = (await listBoard(caseId, ALICE)).nodes[0]!;
    const officer: Officer = {
      officerId: "ID_A",
      name: "SMITH, John",
      role: "director",
      corporate: false,
    };

    const out = await expandNodeRun(
      { caseId, nodeId: seed.id, include: ["officers"] },
      ctx(ALICE, "tool"),
      {
        sources: fakeSources({
          ch: {
            getOfficers: async () =>
              res(
                [officer],
                ev("companies-house", "OC372263", `${CH_PUBLIC}/company/OC372263/officers`),
              ),
          },
        }),
      },
    );

    expect(out.pinnedNodes).toBe(1);
  });

  it("looks each company up once however it is written", async () => {
    const { sources, calls } = chKnowing(["OC372263"]);

    const { caseId } = await createCaseRun(
      { title: "LCM", seeds: [{ companyNumber: "oc372263" }, { companyNumber: " OC372263 " }] },
      ctx(),
      { sources },
    );

    expect(calls).toEqual(["OC372263"]);
    expect((await listBoard(caseId, ALICE)).nodes).toHaveLength(1);
  });

  it("creates nothing, and counts nothing, when a company cannot be found", async () => {
    const { sources } = chKnowing(["OC372263"]);

    await expect(
      createCaseRun(
        { title: "LCM", seeds: [{ companyNumber: "OC372263" }, { companyNumber: "OC999999" }] },
        ctx(),
        { sources },
      ),
    ).rejects.toMatchObject({ errorCode: "source_not_found", statusCode: 404 });

    expect(await testDb.select().from(cases)).toEqual([]);
    expect(await testDb.select().from(usage)).toEqual([]);
  });

  it("refuses over the daily case cap, before looking anything up", async () => {
    vi.stubEnv("REDSTRING_CASES_PER_USER_DAY", "1");
    const { sources, calls } = chKnowing(["OC372263"]);
    await createCaseRun({ title: "One", seeds: [{ companyNumber: "OC372263" }] }, ctx(), {
      sources,
    });
    calls.length = 0;

    await expect(
      createCaseRun({ title: "Two", seeds: [{ companyNumber: "OC372263" }] }, ctx(), { sources }),
    ).rejects.toMatchObject({
      errorCode: "limit_reached",
      statusCode: 429,
      message: "Daily limit reached. Try again tomorrow.",
    });

    expect(calls).toEqual([]);
    expect(await testDb.select().from(cases)).toHaveLength(1);
    // The cap is per person: someone else can still create a case.
    await expect(
      createCaseRun({ title: "Bob", seeds: [{ companyNumber: "OC372263" }] }, ctx(BOB), {
        sources,
      }),
    ).resolves.toHaveProperty("caseId");
  });

  it.each(AGENT_CALLERS)('refuses caller "%s" and creates nothing', async (caller) => {
    const { sources, calls } = chKnowing(["OC372263"]);

    await expect(
      createCaseRun({ title: "x", seeds: [{ companyNumber: "OC372263" }] }, ctx(ALICE, caller), {
        sources,
      }),
    ).rejects.toMatchObject({ code: "agent_not_allowed" });

    expect(calls).toEqual([]);
    expect(await testDb.select().from(cases)).toEqual([]);
  });

  it("pins a US company from the SEC list as a confirmed, expandable seed", async () => {
    const sources: Sources = fakeSources({
      sec: {
        recentFilings: async (cik) =>
          res(
            [],
            ev("sec", cik, `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`),
          ),
      },
    });

    const { caseId } = await createCaseRun(
      { title: "Apple", seeds: [{ cik: "0000320193", name: "Apple Inc." }] },
      ctx(),
      { sources },
    );

    expect((await listBoard(caseId, ALICE)).nodes[0]).toMatchObject({
      type: "company",
      key: "320193",
      label: "Apple Inc.",
      status: "confirmed",
      addedBy: "person",
      facts: { jurisdiction: "us", cik: "320193" },
    });
  });
});

describe("pin-item", () => {
  const pin = {
    type: "document" as const,
    label: "Leak table, row 12",
    sourceUrl: "https://example.org/leak-table",
    reference: "table 2, row 12",
    source: "manual" as const,
  };

  it("rejects an http URL and pins nothing", async () => {
    const c = await createCase(ALICE, "x");

    await expect(
      pinItemRun({ caseId: c.id, ...pin, sourceUrl: "http://example.org/leak-table" }, ctx()),
    ).rejects.toMatchObject({ name: "ProvenanceError", code: "bad_url" });

    expect((await listBoard(c.id, ALICE)).nodes).toEqual([]);
  });

  it("pins a confirmed item for the person, with the source they gave", async () => {
    const c = await createCase(ALICE, "x");

    await pinItemRun({ caseId: c.id, ...pin, source: "occrp" }, ctx());

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]).toMatchObject({
      type: "document",
      label: "Leak table, row 12",
      status: "confirmed",
      addedBy: "person",
    });
    expect(board.nodes[0]?.evidence[0]).toMatchObject({
      source: "occrp",
      url: "https://example.org/leak-table",
      recordId: "table 2, row 12",
    });
    expect(board.nodes[0]?.evidence[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(board.activity.slice(-1)[0]).toMatchObject({ kind: "pin-item", actor: "person" });
  });

  it("pinning the same label again is the same item", async () => {
    const c = await createCase(ALICE, "x");

    await pinItemRun({ caseId: c.id, ...pin }, ctx());
    await pinItemRun({ caseId: c.id, ...pin, label: "  leak TABLE,  row 12 " }, ctx());

    expect((await listBoard(c.id, ALICE)).nodes).toHaveLength(1);
  });

  it.each(AGENT_CALLERS)('refuses caller "%s"', async (caller) => {
    const c = await createCase(ALICE, "x");

    await expect(pinItemRun({ caseId: c.id, ...pin }, ctx(ALICE, caller))).rejects.toMatchObject({
      code: "agent_not_allowed",
    });

    expect((await listBoard(c.id, ALICE)).nodes).toEqual([]);
  });

  it("reads another person's case as not found", async () => {
    const c = await createCase(ALICE, "x");

    await expect(pinItemRun({ caseId: c.id, ...pin }, ctx(BOB))).rejects.toMatchObject({
      errorCode: "case_not_found",
    });
  });
});

describe("annotate, move-node, review-change, review-suggestion", () => {
  it("annotate records the person's note and refuses an unknown target", async () => {
    const { c, node } = await proposedCompany();

    await annotateRun({ caseId: c.id, targetId: node.id, text: "Checked the register." }, ctx());

    expect((await listBoard(c.id, ALICE)).activity.slice(-1)[0]).toMatchObject({
      kind: "annotate",
      actor: "person",
      caller: "frontend",
      targetId: node.id,
      detail: "Checked the register.",
    });
    await expect(
      annotateRun({ caseId: c.id, targetId: "nope", text: "x" }, ctx()),
    ).rejects.toMatchObject({ errorCode: "target_not_found", statusCode: 404 });
  });

  it("move-node saves the position and leaves no activity row", async () => {
    const { c, node } = await proposedCompany();
    const before = (await listBoard(c.id, ALICE)).activity.length;

    await moveNodeRun({ caseId: c.id, nodeId: node.id, x: 120.5, y: -40 }, ctx());

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]).toMatchObject({ x: 120.5, y: -40 });
    expect(board.activity).toHaveLength(before);
    await expect(
      moveNodeRun({ caseId: c.id, nodeId: "nope", x: 1, y: 1 }, ctx()),
    ).rejects.toMatchObject({ errorCode: "node_not_found" });
  });

  it("review-change accepts a pending change once", async () => {
    const { c, node } = await proposedCompany();
    const watch = await addWatch(c.id, ALICE, node.id, "OC000001");
    const change = await addChange(ALICE, {
      caseId: c.id,
      watchId: watch.id,
      kind: "officers",
      summary: "1 officer added",
    });

    const out = await reviewChangeRun(
      { caseId: c.id, changeId: change.id, decision: "accept" },
      ctx(),
    );

    expect(out).toEqual({ changeId: change.id, status: "accepted" });
    expect((await listChanges(c.id, ALICE))[0]?.status).toBe("accepted");
    expect((await listBoard(c.id, ALICE)).activity.slice(-1)[0]).toMatchObject({
      kind: "review-change",
      actor: "person",
      targetId: change.id,
    });
    await expect(
      reviewChangeRun({ caseId: c.id, changeId: change.id, decision: "dismiss" }, ctx()),
    ).rejects.toMatchObject({ errorCode: "status_conflict", statusCode: 409 });
  });

  it("review-suggestion dismisses a suggestion without touching the item", async () => {
    const { c, node } = await proposedCompany();
    const s = await addSuggestion(c.id, ALICE, node.id, "Different incorporation date.");

    const out = await reviewSuggestionRun(
      { caseId: c.id, suggestionId: s.id, decision: "dismiss" },
      ctx(),
    );

    expect(out).toEqual({ suggestionId: s.id, status: "dismissed" });
    const board = await listBoard(c.id, ALICE);
    expect(board.suggestions[0]?.status).toBe("dismissed");
    expect(board.nodes[0]?.status).toBe("proposed");
    expect(board.activity.slice(-1)[0]).toMatchObject({ kind: "review-suggestion", actor: "person" });
  });

  it.each(AGENT_CALLERS)('all four refuse caller "%s"', async (caller) => {
    const { c, node } = await proposedCompany();
    const watch = await addWatch(c.id, ALICE, node.id, "OC000001");
    const change = await addChange(ALICE, {
      caseId: c.id,
      watchId: watch.id,
      kind: "filings",
      summary: "new filing",
    });
    const s = await addSuggestion(c.id, ALICE, node.id, "Different incorporation date.");
    const asCaller = ctx(ALICE, caller);

    const attempts = [
      annotateRun({ caseId: c.id, targetId: node.id, text: "x" }, asCaller),
      moveNodeRun({ caseId: c.id, nodeId: node.id, x: 1, y: 1 }, asCaller),
      reviewChangeRun({ caseId: c.id, changeId: change.id, decision: "accept" }, asCaller),
      reviewSuggestionRun({ caseId: c.id, suggestionId: s.id, decision: "accept" }, asCaller),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: "agent_not_allowed" });
    }

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes[0]?.x).toBeUndefined();
    expect(board.changes[0]?.status).toBe("pending");
    expect(board.suggestions[0]?.status).toBe("open");
    expect(board.activity.some((a) => a.kind === "annotate")).toBe(false);
  });
});

describe("watch-entity", () => {
  it("watches a UK company by its company number, once", async () => {
    const { c, node } = await proposedCompany();

    const first = await watchEntityRun({ caseId: c.id, nodeId: node.id }, ctx());
    const again = await watchEntityRun({ caseId: c.id, nodeId: node.id }, ctx());

    expect(again.watchId).toBe(first.watchId);
    expect(await listWatches(ALICE, c.id)).toMatchObject([
      { id: first.watchId, nodeId: node.id, companyNumber: "OC000001" },
    ]);
    expect((await listBoard(c.id, ALICE)).activity.slice(-1)[0]).toMatchObject({
      kind: "watch",
      actor: "person",
      targetId: node.id,
    });
  });

  it("refuses a US company and a person, which Companies House cannot watch", async () => {
    const { c } = await proposedCompany();
    const us = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "320193",
      label: "Apple Inc.",
      facts: { jurisdiction: "us" },
      evidence: [ev("sec", "320193", "https://www.sec.gov/cgi-bin/browse-edgar?CIK=320193")],
      actor: "person",
      status: "confirmed",
    });
    const officer = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH_PUBLIC}/officers/ID_A`)],
      actor: "agent",
    });

    for (const n of [us, officer]) {
      await expect(watchEntityRun({ caseId: c.id, nodeId: n.id }, ctx())).rejects.toMatchObject({
        errorCode: "not_watchable",
        statusCode: 400,
      });
    }
    expect(await listWatches(ALICE)).toEqual([]);
  });

  it.each(AGENT_CALLERS)('refuses caller "%s"', async (caller) => {
    const { c, node } = await proposedCompany();

    await expect(
      watchEntityRun({ caseId: c.id, nodeId: node.id }, ctx(ALICE, caller)),
    ).rejects.toMatchObject({ code: "agent_not_allowed" });

    expect(await listWatches(ALICE)).toEqual([]);
  });

  it("reads another person's case as not found", async () => {
    const { c, node } = await proposedCompany();

    await expect(
      watchEntityRun({ caseId: c.id, nodeId: node.id }, ctx(BOB)),
    ).rejects.toMatchObject({ errorCode: "case_not_found" });
  });
});

describe("the agent cannot see these actions", () => {
  const PERSON_ONLY = {
    "create-case": createCaseAction,
    "pin-item": pinItem,
    "set-status": setStatus,
    annotate,
    "move-node": moveNode,
    "review-change": reviewChange,
    "watch-entity": watchEntity,
    "review-suggestion": reviewSuggestion,
  };

  // Every action file in actions/. run.ts is the CLI runner, not an action: it
  // exits the process when imported.
  const files = import.meta.glob<{ default?: unknown }>(
    ["./*.ts", "!./*.test.ts", "!./run.ts"],
    { eager: true },
  );
  const registry = Object.fromEntries(
    Object.entries(files)
      .map(([path, mod]) => [path.replace(/^\.\//, "").replace(/\.ts$/, ""), mod.default])
      .filter(([, entry]) => entry && typeof entry === "object" && "tool" in entry),
  ) as Parameters<typeof actionsToEngineTools>[0];

  it("each is registered as uiOnly and absent from the agent's tools and MCP", () => {
    const toolNames = actionsToEngineTools(registry).map((t) => t.name);

    for (const name of Object.keys(PERSON_ONLY)) {
      const entry = registry[name];
      expect(entry, `${name} is in the action registry`).toBeDefined();
      expect(entry?.uiOnly, `${name} is uiOnly`).toBe(true);
      expect(toolNames, `${name} is not an agent tool`).not.toContain(name);
      expect(isActionExposedToExternalAgents(entry!), `${name} is not on MCP/A2A`).toBe(false);
      expect(isActionHiddenFromEveryAgentSurface(entry!), `${name} is hidden`).toBe(true);
    }
  });

  it("the agent's own actions are still there, and no other action is uiOnly", () => {
    const toolNames = actionsToEngineTools(registry).map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining(["search-entity", "expand-node", "check-leaks", "suggest-reject", "get-board"]),
    );

    const uiOnly = Object.entries(registry)
      .filter(([, e]) => e.uiOnly === true)
      .map(([name]) => name)
      .sort();
    expect(uiOnly).toEqual(Object.keys(PERSON_ONLY).sort());
  });
});
