import type { ActionCaller, ActionRunContext } from "@agent-native/core/action";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../server/db/test-db.js";
import { createCase, listBoard, pinNode, setStatus } from "../server/board/store.js";
import { BRIEF_FOOTER } from "../server/board/brief.js";
import { CH_PUBLIC, ev } from "../server/board/test-sources.js";
import exportBrief, { exportBriefRun } from "./export-brief.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../server/db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";
const NOW = () => new Date("2026-11-05T09:30:00.000Z");

const ctx = (email = ALICE, caller: ActionCaller = "frontend"): ActionRunContext => ({
  userEmail: email,
  caller,
});

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

async function caseWithTwoCards() {
  const c = await createCase(ALICE, "Quay Street");
  const pin = (number: string, label: string, actor: "person" | "agent") =>
    pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: number,
      label,
      facts: { jurisdiction: "uk", number },
      evidence: [ev("companies-house", number, `${CH_PUBLIC}/company/${number}`)],
      actor,
      ...(actor === "person" ? { status: "confirmed" as const } : {}),
    });
  const confirmed = await pin("OC000001", "HARLOW QUAY TRADING LLP", "person");
  const proposed = await pin("OC000002", "BRINDLE & MARSH HOLDINGS LLP", "agent");
  return { c, confirmed, proposed };
}

describe("export-brief", () => {
  it("writes the case as a sourced brief: the confirmed card cited, the proposed one kept apart", async () => {
    const { c } = await caseWithTwoCards();

    const out = await exportBriefRun({ caseId: c.id }, ctx(), { now: NOW });

    expect(out.citations).toBe(2);
    expect(out.unconfirmed).toBe(1);
    expect(out.markdown.split("\n")[0]).toBe("# Quay Street");
    expect(out.markdown).toContain("Prepared 2026-11-05.");
    const [findings, rest] = out.markdown.split("## Unconfirmed");
    expect(findings).toMatch(/- Company: HARLOW QUAY TRADING LLP \(OC000001\) \[E1\]/);
    expect(findings).not.toContain("BRINDLE");
    expect(rest).toContain("BRINDLE & MARSH HOLDINGS LLP");
    expect(out.markdown.trimEnd().split("\n").pop()).toBe(BRIEF_FOOTER);
  });

  it("is declared as needing approval, and is the only action that does", async () => {
    expect(exportBrief.needsApproval).toBe(true);
    // The person's own button is a proven UI call, which the framework lets through; an agent,
    // MCP, HTTP or A2A call pauses for the person. Not person-only: the agent may ask.
    expect(exportBrief.uiOnly).not.toBe(true);

    const files = import.meta.glob<{ default?: { needsApproval?: unknown } }>(
      ["./*.ts", "!./*.test.ts", "!./run.ts"],
      { eager: true },
    );
    const gated = Object.entries(files)
      .filter(([, mod]) => mod.default && mod.default.needsApproval !== undefined && mod.default.needsApproval !== false)
      .map(([path]) => path);
    expect(gated).toEqual(["./export-brief.ts"]);
  });

  it("leaves a trace on the case of who exported it and what it held", async () => {
    const { c } = await caseWithTwoCards();

    await exportBriefRun({ caseId: c.id }, ctx(ALICE, "frontend"), { now: NOW });
    await exportBriefRun({ caseId: c.id }, ctx(ALICE, "tool"), { now: NOW });

    const rows = (await listBoard(c.id, ALICE)).activity.filter((a) => a.kind === "export-brief");
    expect(rows).toMatchObject([
      { actor: "person", caller: "frontend", detail: "2 sources, 1 unconfirmed" },
      { actor: "agent", caller: "tool", detail: "2 sources, 1 unconfirmed" },
    ]);
  });

  it("changes nothing on the board: no card or string moves status", async () => {
    const { c } = await caseWithTwoCards();
    const before = await listBoard(c.id, ALICE);
    await exportBriefRun({ caseId: c.id }, ctx(), { now: NOW });
    const after = await listBoard(c.id, ALICE);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
  });

  it("reads a ruled-out card with the person's reason", async () => {
    const { c, proposed } = await caseWithTwoCards();
    await setStatus({
      caseId: c.id,
      ownerEmail: ALICE,
      targetKind: "node",
      targetId: proposed.id,
      to: "rejected",
      reason: "A different company with a similar name.",
      actor: "person",
    });
    const out = await exportBriefRun({ caseId: c.id }, ctx(), { now: NOW });
    expect(out.markdown).toMatch(
      /- Rejected: Company: BRINDLE & MARSH HOLDINGS LLP \(OC000002\) — A different company with a similar name\. \[E2\]/,
    );
    expect(out.unconfirmed).toBe(0);
  });

  it("reads only the caller's case: someone else's case is not found", async () => {
    const { c } = await caseWithTwoCards();
    await expect(exportBriefRun({ caseId: c.id }, ctx(BOB))).rejects.toMatchObject({
      errorCode: "case_not_found",
      statusCode: 404,
    });
    expect((await listBoard(c.id, ALICE)).activity.filter((a) => a.kind === "export-brief")).toEqual([]);
  });

  it("needs a signed-in caller", async () => {
    const { c } = await caseWithTwoCards();
    await expect(exportBriefRun({ caseId: c.id }, { caller: "frontend" })).rejects.toMatchObject({
      errorCode: "not_signed_in",
    });
  });
});
