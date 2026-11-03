import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { BoardNode } from "../../../server/board/types";
import { NodeCard } from "./NodeCard";

export interface CardData extends Record<string, unknown> {
  node: BoardNode;
  selected: boolean;
  dimmed: boolean;
}

// Every string is pinned at the card's pin, so both handles sit exactly there.
const pinHandle = { top: 9, left: "50%", opacity: 0, pointerEvents: "none" as const };

/** The canvas's wrapper around a card: a pin for strings to attach to. */
export function BoardNodeView({ data }: NodeProps) {
  const d = data as CardData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={pinHandle} isConnectable={false} />
      <Handle type="source" position={Position.Top} style={pinHandle} isConnectable={false} />
      <NodeCard node={d.node} selected={d.selected} dimmed={d.dimmed} />
    </>
  );
}
