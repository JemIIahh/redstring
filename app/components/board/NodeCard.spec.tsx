// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { BoardNode, EvidenceRow } from "../../../server/board/types";
import { NodeCard } from "./NodeCard";

afterEach(cleanup);

function evidence(n: number): EvidenceRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ev${i}`,
    source: "companies-house" as const,
    url: `https://example.test/record/${i}`,
    recordId: `rec-${i}`,
    retrievedAt: "2026-11-03T10:00:00.000Z",
    contentHash: `hash-${i}`,
  }));
}

function node(over: Partial<BoardNode>): BoardNode {
  return {
    id: "n1",
    caseId: "c1",
    type: "company",
    key: "uk:00000001",
    label: "Example Trading Ltd",
    facts: { number: "00000001", status: "active" },
    status: "confirmed",
    addedBy: "person",
    evidence: evidence(3),
    createdAt: "2026-11-03T10:00:00.000Z",
    ...over,
  };
}

describe("NodeCard", () => {
  it('shows status, actor and evidence count, and labels a proposed agent item "proposed by agent"', () => {
    const { rerender } = render(<NodeCard node={node({})} />);
    // A confirmed item the person added: the stamp, the actor and the source count all show.
    expect(screen.getByText("confirmed")).toBeTruthy();
    expect(screen.getByText("Added by you")).toBeTruthy();
    expect(screen.getByText("3 sources")).toBeTruthy();
    expect(screen.getByText("Example Trading Ltd")).toBeTruthy();

    // The agent can only propose: the card says so, in words, and keeps a singular count.
    rerender(
      <NodeCard node={node({ status: "proposed", addedBy: "agent", evidence: evidence(1) })} />,
    );
    expect(screen.getByText("proposed")).toBeTruthy();
    expect(screen.getByText("Proposed by agent")).toBeTruthy();
    expect(screen.getByText("1 source")).toBeTruthy();
    expect(screen.queryByText("Added by you")).toBeNull();
  });

  it("shows the reason on a rejected card and not on a confirmed one", () => {
    const { rerender } = render(
      <NodeCard node={node({ status: "rejected", reason: "Different company, same name" })} />,
    );
    expect(screen.getByText("Different company, same name")).toBeTruthy();

    rerender(<NodeCard node={node({ status: "confirmed", reason: "left over" })} />);
    expect(screen.queryByText("left over")).toBeNull();
  });
});
