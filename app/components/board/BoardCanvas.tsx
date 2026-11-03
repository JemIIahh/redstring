import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";

import type { Board } from "../../../server/board/types";
import { BoardNodeView, type CardData } from "./BoardNodeView";
import { positionsFor } from "./layout";
import { StringEdge, type StringData } from "./StringEdge";

const nodeTypes = { card: BoardNodeView };
const edgeTypes = { string: StringEdge };

interface BoardCanvasProps {
  board: Board;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  /** Bring this card into view (once per id): the agent pointed at it, or the address names it. */
  focusId?: string;
  /** Called once when a card is let go after a drag. */
  onMove?: (nodeId: string, x: number, y: number) => void;
}

/**
 * Fits the whole wall into view once, after the cards have been measured. The
 * built-in fit on first render can run before the page has its final size.
 */
function FitWhenReady() {
  const ready = useNodesInitialized();
  const { fitView, getNodes, setCenter } = useReactFlow();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    // One frame later, so the container has its final size.
    const frame = requestAnimationFrame(() => {
      // A phone cannot show the whole wall at a readable size: open on the first
      // confirmed card at full size and let the person pan. A desktop fits it all.
      if (window.innerWidth < 640) {
        const all = getNodes() as Node<CardData>[];
        const first = all.find((n) => n.data.node.status === "confirmed") ?? all[0];
        if (first) {
          void setCenter(first.position.x + 116, first.position.y + 70, { zoom: 0.85, duration: 0 });
          return;
        }
      }
      void fitView({ padding: 0.12, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, fitView, getNodes, setCenter]);
  return null;
}

/** Pans to one card when asked to, unless the person has asked their system for less motion. */
function FocusOn({ id }: { id: string | undefined }) {
  const ready = useNodesInitialized();
  const { getNode, getZoom, setCenter } = useReactFlow();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || !ready || last.current === id) return;
    const card = getNode(id);
    if (!card) return;
    last.current = id;
    // After the first fit, which also waits a frame, so this one wins.
    const frame = requestAnimationFrame(() => {
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      void setCenter(card.position.x + 116, card.position.y + 70, {
        zoom: Math.max(getZoom(), 0.85),
        duration: calm ? 0 : 400,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [id, ready, getNode, getZoom, setCenter]);
  return null;
}

/**
 * The wall. Cards are pinned where the person left them; strings sag between
 * pins. Selecting a card brings its strings forward and dims the rest.
 */
export function BoardCanvas({ board, selectedIds, onSelect, onMove, focusId }: BoardCanvasProps) {
  const placed = useMemo(() => positionsFor(board.nodes), [board.nodes]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Cards joined to a selected card by any string stay bright.
  const neighbours = useMemo(() => {
    const out = new Set<string>();
    for (const e of board.edges) {
      if (selected.has(e.fromId)) out.add(e.toId);
      if (selected.has(e.toId)) out.add(e.fromId);
    }
    return out;
  }, [board.edges, selected]);

  // Built before the first render so the first fit-to-view already sees the cards.
  const buildNodes = (previous: Node<CardData>[]): Node<CardData>[] => {
    const was = new Map(previous.map((p) => [p.id, p]));
    return board.nodes.map((n) => ({
      id: n.id,
      type: "card",
      // A card the person already dragged keeps where it is.
      position: was.get(n.id)?.position ?? placed.get(n.id) ?? { x: 0, y: 0 },
      zIndex: selected.has(n.id) ? 10 : 0,
      data: {
        node: n,
        selected: selected.has(n.id),
        dimmed: selected.size > 0 && !selected.has(n.id) && !neighbours.has(n.id),
      },
    }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialNodes = useMemo(() => buildNodes([]), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>(initialNodes);
  useEffect(() => {
    setNodes(buildNodes);
    // buildNodes closes over exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.nodes, placed, selected, neighbours, setNodes]);

  const edges = useMemo<Edge<StringData>[]>(
    () =>
      board.edges.map((e, index) => {
        const active = selected.has(e.fromId) || selected.has(e.toId);
        return {
          id: e.id,
          type: "string",
          source: e.fromId,
          target: e.toId,
          selectable: false,
          focusable: false,
          // Strings run in front of the cards they pass over; a selected card's
          // strings are in front of everything, tacks included.
          zIndex: active ? 11 : 5,
          data: {
            status: e.status,
            type: e.type,
            active,
            dimmed: selected.size > 0 && !active,
            index,
          },
        };
      }),
    [board.edges, selected],
  );

  return (
    <div className="rs-board h-full w-full" data-testid="board-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        elementsSelectable={false}
        selectNodesOnDrag={false}
        onNodeClick={(event, node) => {
          const additive = event.shiftKey || event.metaKey || event.ctrlKey;
          onSelect(
            additive
              ? selected.has(node.id)
                ? selectedIds.filter((id) => id !== node.id)
                : [...selectedIds, node.id]
              : [node.id],
          );
        }}
        onPaneClick={() => onSelect([])}
        onNodeDragStop={(_, node) =>
          onMove?.(node.id, Math.round(node.position.x), Math.round(node.position.y))
        }
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="var(--rs-felt-dot)" />
        <Controls showInteractive={false} position="bottom-right" fitViewOptions={{ padding: 0.12 }} />
        <FitWhenReady />
        <FocusOn id={focusId} />
      </ReactFlow>
    </div>
  );
}
