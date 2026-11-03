import { describe, expect, it } from "vitest";

import { AGENT_LIMITS, agentBoardView, type FullBoard } from "./agent-view.js";
import type { ActivityRow, BoardEdge, BoardNode, EvidenceRow, Status } from "./types.js";

const ev = (n: number): EvidenceRow => ({
  id: `ev-${n}`,
  source: "companies-house",
  url: `https://find-and-update.company-information.service.gov.uk/company/OC${100000 + n}/officers`,
  recordId: `OC${100000 + n}/officers`,
  retrievedAt: "2026-11-03T10:15:00.000Z",
  contentHash: "9f2c1d7a8b3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8",
  excerpt: "Director, appointed 2019-04-02, born 03/1975, British",
});

const node = (i: number, status: Status = "proposed", reason?: string): BoardNode => ({
  id: `node-${String(i).padStart(4, "0")}-aaaa-bbbb-cccc-dddddddddddd`,
  caseId: "c1",
  type: i % 3 === 0 ? "person" : "company",
  key: `OC${100000 + i}`,
  label: `EXAMPLE TRADING ${i} LLP`,
  facts: { jurisdiction: "uk", number: `OC${100000 + i}`, type: "llp", status: "active", address: "1 Quay Street, Leeds, LS1 1AA" },
  status,
  ...(reason ? { reason } : {}),
  addedBy: "agent",
  evidence: [ev(i), ev(i + 1000)],
  createdAt: `2026-11-03T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
});

const edge = (i: number, from: BoardNode, to: BoardNode): BoardEdge => ({
  id: `edge-${String(i).padStart(4, "0")}-aaaa-bbbb-cccc-dddddddddddd`,
  caseId: "c1",
  type: "officer-of",
  fromId: from.id,
  toId: to.id,
  status: "proposed",
  addedBy: "agent",
  evidence: [ev(i)],
});

const act = (i: number): ActivityRow => ({
  id: `a${i}`,
  caseId: "c1",
  actor: i % 2 ? "agent" : "person",
  caller: i % 2 ? "tool" : "frontend",
  kind: "expand",
  detail: `step ${i}`,
  at: `2026-11-03T10:${String(i % 60).padStart(2, "0")}:${String(Math.floor(i / 60)).padStart(2, "0")}.000Z`,
});

function board(nodes: BoardNode[], edges: BoardEdge[], activity: ActivityRow[] = []): FullBoard {
  return {
    caseId: "c1",
    title: "Quay Street shells",
    nodes,
    edges,
    activity,
    coverage: [{ source: "icij", state: "no_match", note: "No candidates" }],
    suggestions: [
      { id: "s1", targetId: nodes[0]!.id, reason: "Different company", status: "open" },
      { id: "s2", targetId: nodes[0]!.id, reason: "Old", status: "dismissed" },
    ],
    changes: [
      { id: "ch1", caseId: "c1", watchId: "w1", kind: "filings", summary: "2 new filings", status: "pending", createdAt: "2026-11-03T10:00:00.000Z" },
      { id: "ch2", caseId: "c1", watchId: "w1", kind: "officers", summary: "old", status: "accepted", createdAt: "2026-11-03T09:00:00.000Z" },
    ],
    observations: [],
  };
}

describe("agentBoardView", () => {
  it("keeps what the agent needs to orient itself: ids, labels, status, who added, reasons, coverage", () => {
    const a = node(1, "rejected", "Different person, same name");
    const b = node(2, "dead-end", "Dissolved in 2016");
    const view = agentBoardView(board([a, b], [edge(1, a, b)]));
    expect(view.caseId).toBe("c1");
    expect(view.title).toBe("Quay Street shells");
    expect(view.nodes[0]).toMatchObject({
      id: a.id,
      type: "company",
      label: a.label,
      status: "rejected",
      reason: "Different person, same name",
      addedBy: "agent",
    });
    // A dead end and its reason must never be lost: the agent must not propose it again.
    expect(view.nodes[1]).toMatchObject({ status: "dead-end", reason: "Dissolved in 2016" });
    expect(view.edges[0]).toMatchObject({ fromId: a.id, toId: b.id, type: "officer-of", status: "proposed" });
    expect(view.coverage).toEqual([{ source: "icij", state: "no_match", note: "No candidates" }]);
  });

  it("names each source (register and record id) but leaves out urls, hashes, dates and excerpts", () => {
    const a = node(1);
    const view = agentBoardView(board([a], []));
    expect(view.nodes[0]!.sources).toEqual([
      { source: "companies-house", recordId: "OC100001/officers" },
      { source: "companies-house", recordId: "OC101001/officers" },
    ]);
    const text = JSON.stringify(view);
    expect(text).not.toContain("https://");
    expect(text).not.toContain("9f2c1d7a");
    // Month and year of birth stay in the sources panel, not in the agent's board read.
    expect(text).not.toContain("1975");
  });

  it("lists only open suggestions and pending changes, and only the latest activity", () => {
    const a = node(1);
    const rows = Array.from({ length: AGENT_LIMITS.activity + 15 }, (_, i) => act(i));
    const view = agentBoardView(board([a], [], rows));
    expect(view.suggestions.map((s) => s.id)).toEqual(["s1"]);
    expect(view.changes.map((c) => c.id)).toEqual(["ch1"]);
    expect(view.activity).toHaveLength(AGENT_LIMITS.activity);
    // Newest kept, newest first.
    expect(view.activity[0]!.id).toBe(`a${AGENT_LIMITS.activity + 14}`);
    expect(view.omitted?.activity).toBe(15);
  });

  it("stays well inside the agent's result limit for a big board", () => {
    const nodes = Array.from({ length: 150 }, (_, i) => node(i + 1));
    const edges = Array.from({ length: 200 }, (_, i) => edge(i + 1, nodes[i % 150]!, nodes[(i * 7 + 1) % 150]!));
    const view = agentBoardView(board(nodes, edges));
    expect(view.nodes).toHaveLength(150);
    expect(view.edges).toHaveLength(200);
    expect(view.omitted).toBeUndefined();
    // The framework keeps 50,000 characters of a pretty-printed result by default.
    expect(JSON.stringify(view, null, 2).length).toBeLessThan(AGENT_LIMITS.resultChars);
  });

  it("says plainly how much it left out when a board is bigger than it will list", () => {
    const nodes = Array.from({ length: AGENT_LIMITS.nodes + 25 }, (_, i) => node(i + 1));
    const edges = [edge(1, nodes[0]!, nodes[1]!), edge(2, nodes[0]!, nodes[AGENT_LIMITS.nodes + 5]!)];
    const view = agentBoardView(board(nodes, edges));
    expect(view.nodes).toHaveLength(AGENT_LIMITS.nodes);
    // A string to a card that is not listed is not listed either.
    expect(view.edges.map((e) => e.id)).toEqual([edges[0]!.id]);
    expect(view.omitted).toMatchObject({ nodes: 25, edges: 1 });
  });
});
