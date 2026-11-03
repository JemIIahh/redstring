import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";

import type { EdgeType, Status } from "../../../server/board/types";
import { threadBetween, type Point } from "./thread";

export interface StringData extends Record<string, unknown> {
  status: Status;
  type: EdgeType;
  /** One end of this string is a selected card. */
  active: boolean;
  /** Something else is selected and this string is not part of it. */
  dimmed: boolean;
  /** Position in the board's drawing order, to stagger the draw-in. */
  index: number;
}

export const EDGE_WORDS: Record<EdgeType, string> = {
  "officer-of": "officer of",
  "member-of": "member of",
  controls: "controls",
  "registered-at": "registered at",
  "same-address": "same address",
  "candidate-match": "candidate match",
};

const CARD_W = 232;
const CARD_H = 140;

/** Where a straight line from the middle of a card toward `toward` leaves the card. */
function edgePoint(node: InternalNode | undefined, toward: Point, fallback: Point): Point {
  if (!node) return fallback;
  const w = node.measured.width ?? CARD_W;
  const h = node.measured.height ?? CARD_H;
  const { x, y } = node.internals.positionAbsolute;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(w / 2 / Math.abs(dx || 1e-9), h / 2 / Math.abs(dy || 1e-9));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** A strand of cut thread hanging from `from`, reaching about a third of the way toward `toward`. */
export function hanging(from: Point, toward: Point): string {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const q = { x: from.x + dx * 0.16, y: from.y + dy * 0.16 + 20 };
  const end = { x: from.x + dx * 0.3, y: from.y + dy * 0.3 + 38 };
  return `M ${from.x} ${from.y} Q ${q.x} ${q.y} ${end.x} ${end.y}`;
}

const centreOf = (node: InternalNode | undefined, fallback: Point): Point =>
  node
    ? {
        x: node.internals.positionAbsolute.x + (node.measured.width ?? CARD_W) / 2,
        y: node.internals.positionAbsolute.y + (node.measured.height ?? CARD_H) / 2,
      }
    : fallback;

/**
 * One string between two cards. How it is drawn says how much to trust it:
 * confirmed is solid red thread, proposed is thin and dashed, rejected is cut
 * with a gap in the middle, a dead end stops at a knot.
 */
export function StringEdge({ source, target, sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const d = data as StringData;
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  // The string is tacked to each card's edge, on the line between the two cards,
  // so all of it shows between them.
  const a0 = centreOf(from, { x: sourceX, y: sourceY });
  const b0 = centreOf(to, { x: targetX, y: targetY });
  const a = edgePoint(from, b0, { x: sourceX, y: sourceY });
  const b = edgePoint(to, a0, { x: targetX, y: targetY });
  const thread = threadBetween(a, b);
  const knot = d.status === "dead-end" ? thread.at(0.72) : undefined;
  const cut = d.status === "rejected";
  const mid = cut ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 18 } : thread.at(0.5);
  // pathLength lets the knot be set as a share of the string.
  const measured = d.status === "confirmed" || d.status === "dead-end";

  return (
    <g
      className={`rs-thread rs-thread--${d.status}${d.active ? " is-active" : ""}${d.dimmed ? " is-dim" : ""}`}
      style={{ "--rs-i": d.index } as React.CSSProperties}
      data-status={d.status}
    >
      {cut ? (
        // Cut: each end hangs from its tack and stops, with a gap between.
        [hanging(a, b), hanging(b, a)].map((path, i) => (
          <path key={i} d={path} className="rs-thread-line" />
        ))
      ) : (
        <>
          <path d={thread.path} className="rs-thread-shadow" {...(measured ? { pathLength: 100 } : {})} />
          <path d={thread.path} className="rs-thread-line" {...(measured ? { pathLength: 100 } : {})} />
        </>
      )}
      {knot ? <circle cx={knot.x} cy={knot.y} r={4.5} className="rs-thread-knot" /> : null}
      <circle cx={a.x} cy={a.y} r={4.6} className="rs-tack" />
      <circle cx={b.x} cy={b.y} r={4.6} className="rs-tack" />
      {d.active ? (
        <EdgeLabelRenderer>
          <div
            className="rs-thread-tag"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y + 4}px)` }}
          >
            {EDGE_WORDS[d.type]}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}
