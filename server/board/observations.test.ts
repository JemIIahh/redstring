import { describe, expect, it } from "vitest";

import { computeObservations } from "./observations.js";
import type { BoardEdge, BoardNode, EdgeType, NodeType } from "./types.js";

const node = (
  id: string,
  type: NodeType,
  over: Partial<BoardNode> = {},
): BoardNode => ({
  id,
  caseId: "c",
  type,
  key: id,
  label: id,
  facts: {},
  status: "proposed",
  addedBy: "agent",
  evidence: [],
  createdAt: "2026-11-03T00:00:00.000Z",
  ...over,
});

const edge = (
  id: string,
  type: EdgeType,
  fromId: string,
  toId: string,
  over: Partial<BoardEdge> = {},
): BoardEdge => ({
  id,
  caseId: "c",
  type,
  fromId,
  toId,
  status: "proposed",
  addedBy: "agent",
  evidence: [
    {
      id: `ev-${id}`,
      source: "companies-house",
      url: "https://find-and-update.company-information.service.gov.uk/",
      recordId: id,
      retrievedAt: "2026-11-03T10:00:00.000Z",
      contentHash: "h",
    },
  ],
  ...over,
});

const threeAtOneAddress = () => ({
  nodes: [
    node("c1", "company"),
    node("c2", "company"),
    node("c3", "company"),
    node("addr", "address"),
  ],
  edges: [
    edge("e1", "registered-at", "c1", "addr"),
    edge("e2", "registered-at", "c2", "addr"),
    edge("e3", "registered-at", "c3", "addr"),
  ],
});

describe("computeObservations", () => {
  it("reports 3 companies at one address with ids and no prose", () => {
    const out = computeObservations(threeAtOneAddress());

    expect(out).toEqual([
      {
        kind: "shared-address",
        count: 3,
        nodeIds: ["addr", "c1", "c2", "c3"],
        evidenceIds: ["ev-e1", "ev-e2", "ev-e3"],
      },
    ]);
    expect(Object.keys(out[0]!).sort()).toEqual([
      "count",
      "evidenceIds",
      "kind",
      "nodeIds",
    ]);
  });

  it("says nothing about a company alone at its address", () => {
    const b = threeAtOneAddress();
    b.edges = b.edges.slice(0, 1);
    expect(computeObservations(b)).toEqual([]);
  });

  it("reports an officer of two companies, and counts LLP members too", () => {
    const out = computeObservations({
      nodes: [node("p1", "person"), node("c1", "company"), node("c2", "company")],
      edges: [
        edge("e1", "officer-of", "p1", "c1"),
        edge("e2", "member-of", "p1", "c2"),
      ],
    });

    expect(out).toEqual([
      {
        kind: "shared-officer",
        count: 2,
        nodeIds: ["p1", "c1", "c2"],
        evidenceIds: ["ev-e1", "ev-e2"],
      },
    ]);
  });

  it("does not treat a controller of two companies as a shared officer", () => {
    const out = computeObservations({
      nodes: [node("p1", "person"), node("c1", "company"), node("c2", "company")],
      edges: [
        edge("e1", "controls", "p1", "c1"),
        edge("e2", "controls", "p1", "c2"),
      ],
    });
    expect(out).toEqual([]);
  });

  it("leaves out rejected and dead-end nodes and edges", () => {
    const b = threeAtOneAddress();
    b.nodes[2] = node("c3", "company", { status: "rejected", reason: "wrong firm" });
    expect(computeObservations(b)[0]).toMatchObject({
      count: 2,
      nodeIds: ["addr", "c1", "c2"],
    });

    const c = threeAtOneAddress();
    c.edges[1] = edge("e2", "registered-at", "c2", "addr", {
      status: "dead-end",
      reason: "no more to find",
    });
    expect(computeObservations(c)[0]).toMatchObject({
      count: 2,
      nodeIds: ["addr", "c1", "c3"],
    });
  });

  it("groups companies joined by same-address edges when there is no address node", () => {
    const out = computeObservations({
      nodes: [node("c1", "company"), node("c2", "company"), node("c3", "company")],
      edges: [
        edge("e1", "same-address", "c1", "c2"),
        edge("e2", "same-address", "c1", "c3"),
      ],
    });

    expect(out).toEqual([
      {
        kind: "shared-address",
        count: 3,
        nodeIds: ["c1", "c2", "c3"],
        evidenceIds: ["ev-e1", "ev-e2"],
      },
    ]);
  });

  it("does not repeat a same-address group an address node already covers", () => {
    const b = threeAtOneAddress();
    b.edges.push(edge("s1", "same-address", "c1", "c2"));
    expect(computeObservations(b)).toHaveLength(1);
  });

  it("lists the biggest group first", () => {
    const out = computeObservations({
      nodes: [
        node("p1", "person"),
        node("c1", "company"),
        node("c2", "company"),
        node("c3", "company"),
        node("addr", "address"),
      ],
      edges: [
        edge("e1", "officer-of", "p1", "c1"),
        edge("e2", "officer-of", "p1", "c2"),
        edge("e3", "registered-at", "c1", "addr"),
        edge("e4", "registered-at", "c2", "addr"),
        edge("e5", "registered-at", "c3", "addr"),
      ],
    });
    expect(out.map((o) => [o.kind, o.count])).toEqual([
      ["shared-address", 3],
      ["shared-officer", 2],
    ]);
  });
});
