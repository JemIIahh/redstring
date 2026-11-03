import type { BoardNode, NodeType } from "../../../server/board/types";

const CARD_W = 232;
const GAP_X = 48;
const GAP_Y = 80;
const ROW_H = 240;
const PER_ROW = 5;

// Top to bottom: where things are, who they are, what they own, what was found.
const LANES: NodeType[] = ["address", "company", "person", "document"];

/**
 * Where a card goes when the person has not placed it yet: one lane per kind
 * of thing, filled left to right. Cards that already have a position keep it.
 */
export function positionsFor(nodes: BoardNode[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  let top = 0;
  for (const lane of LANES) {
    const inLane = nodes.filter((n) => n.type === lane);
    inLane.forEach((n, i) => {
      out.set(n.id, {
        x: n.x ?? (i % PER_ROW) * (CARD_W + GAP_X),
        y: n.y ?? top + Math.floor(i / PER_ROW) * ROW_H,
      });
    });
    if (inLane.length > 0) top += Math.ceil(inLane.length / PER_ROW) * ROW_H + GAP_Y;
  }
  return out;
}
