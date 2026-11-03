import { describe, expect, it } from "vitest";

import { sampleBoard } from "../fixtures/laundromat-board";
import { applyAnswer } from "./use-board";

describe("answering on the sample board", () => {
  it("marks one change accepted or dismissed and leaves every card as it was", () => {
    const next = applyAnswer(sampleBoard, { kind: "change", id: "ch1", decision: "dismiss" });
    expect(next.changes.find((c) => c.id === "ch1")?.status).toBe("dismissed");
    expect(next.nodes).toEqual(sampleBoard.nodes);
    expect(next.edges).toEqual(sampleBoard.edges);
    expect(applyAnswer(sampleBoard, { kind: "change", id: "ch1", decision: "accept" }).changes[0]?.status).toBe("accepted");
  });

  it("answers a suggestion without changing the card it is about", () => {
    const next = applyAnswer(sampleBoard, { kind: "suggestion", id: "s1", decision: "accept" });
    expect(next.suggestions.find((s) => s.id === "s1")?.status).toBe("accepted");
    expect(next.nodes.find((n) => n.id === "d3")).toEqual(sampleBoard.nodes.find((n) => n.id === "d3"));
  });

  it("records the answer in the activity log as the person's, and ignores an unknown id", () => {
    const next = applyAnswer(sampleBoard, { kind: "change", id: "ch1", decision: "accept" });
    expect(next.activity[next.activity.length - 1]).toMatchObject({ actor: "person", kind: "review-change", detail: "accepted" });
    const same = applyAnswer(sampleBoard, { kind: "change", id: "nope", decision: "accept" });
    expect(same.changes).toEqual(sampleBoard.changes);
  });
});
