import { IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import type { CaseBoard, LocalAnswer } from "@/hooks/use-board";
import type { BoardEdge, BoardNode } from "../../../server/board/types";
import { ActivityLog } from "./ActivityLog";
import { CoveragePanel } from "./CoveragePanel";
import { EvidencePanel } from "./EvidencePanel";
import { ExportButton } from "./ExportButton";
import { GoDeeper } from "./GoDeeper";
import { KnownListCheck } from "./KnownListCheck";
import { factsLine, STATUS_WORD, whoAdded } from "./NodeCard";
import { ObservationsStrip } from "./ObservationsStrip";
import { ReviewQueue } from "./ReviewQueue";
import { StatusControls, StatusControlsView, type SetStatusArgs } from "./StatusControls";
import { EDGE_WORDS } from "./StringEdge";
import { canWatch, WatchButton } from "./WatchButton";

export type PanelTab = "item" | "review" | "coverage" | "patterns" | "activity" | "check" | "brief";

/**
 * Which panel is open after the person picks (or clears) something on the board. Any pick
 * opens that item's sources, whatever was open before; clearing closes only that panel,
 * because the case-wide ones are not about the pick.
 */
export function tabAfterSelect(current: PanelTab | null, ids: readonly string[]): PanelTab | null {
  if (ids.length > 0) return "item";
  return current === "item" ? null : current;
}

export const TAB_TITLE: Record<PanelTab, string> = {
  item: "Selected",
  review: "To review",
  coverage: "What was searched",
  patterns: "Patterns",
  activity: "Activity",
  check: "Check a list",
  brief: "Brief",
};

interface Props {
  board: CaseBoard;
  caseId: string;
  tab: PanelTab;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  /** The sample board decides in memory; a real case saves through `set-status`. */
  decideLocally?: (args: SetStatusArgs) => Promise<unknown>;
  answerLocally?: (answer: LocalAnswer) => Promise<unknown>;
}

/** Status and who added it, said once: a proposal from the agent already says both. */
function standing(item: Pick<BoardNode, "status" | "addedBy">): string {
  if (item.status === "proposed" && item.addedBy === "agent") return "Proposed by agent";
  const word = STATUS_WORD[item.status];
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} · ${whoAdded(item).toLowerCase()}`;
}

function ItemHeader({ title, status, facts, reason }: { title: string; status: string; facts?: string; reason?: string | undefined }) {
  return (
    <header className="flex flex-col gap-1">
      <h3 className="text-base font-semibold leading-snug">{title}</h3>
      <p className="text-xs text-muted-foreground">{status}</p>
      {facts ? <p className="text-xs text-muted-foreground">{facts}</p> : null}
      {reason ? <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{reason}</p> : null}
    </header>
  );
}

function Item({ board, caseId, selectedIds, decideLocally }: Pick<Props, "board" | "caseId" | "selectedIds" | "decideLocally">) {
  if (selectedIds.length === 0) {
    return <p className="text-sm text-muted-foreground">Select a card or a string to see where it came from.</p>;
  }
  if (selectedIds.length > 1) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{selectedIds.length} items selected.</p>
        {decideLocally ? null : <GoDeeper caseId={caseId} selectedIds={selectedIds} />}
      </div>
    );
  }

  const id = selectedIds[0]!;
  const node: BoardNode | undefined = board.nodes.find((n) => n.id === id);
  const edge: BoardEdge | undefined = node ? undefined : board.edges.find((e) => e.id === id);
  const item = node ?? edge;
  if (!item) return <p className="text-sm text-muted-foreground">That item is no longer on the board.</p>;

  const label = (nodeId: string) => board.nodes.find((n) => n.id === nodeId)?.label ?? "an item";
  const title = node ? node.label : `${label(edge!.fromId)} · ${EDGE_WORDS[edge!.type]} · ${label(edge!.toId)}`;
  const target = { kind: node ? ("node" as const) : ("edge" as const), id, status: item.status };
  const reasoned = item.status === "rejected" || item.status === "dead-end";

  return (
    <div className="flex flex-col gap-5">
      <ItemHeader
        title={title}
        status={standing(item)}
        {...(node ? { facts: factsLine(node) } : {})}
        reason={reasoned ? item.reason : undefined}
      />
      {decideLocally ? (
        <StatusControlsView caseId={caseId} target={target} setStatus={decideLocally} />
      ) : (
        <StatusControls caseId={caseId} target={target} />
      )}
      {node && !decideLocally && canWatch(node) ? <WatchButton caseId={caseId} nodeId={node.id} /> : null}
      <EvidencePanel title={title} evidence={item.evidence} />
      {decideLocally ? null : <GoDeeper caseId={caseId} selectedIds={selectedIds} />}
    </div>
  );
}

/**
 * Everything that is not the board. It opens over the right edge (the bottom on a phone) and
 * closes again; the board does not move to make room.
 */
export function CasePanel({ board, caseId, tab, selectedIds, onSelect, onClose, decideLocally, answerLocally }: Props) {
  return (
    <aside
      aria-label={TAB_TITLE[tab]}
      data-testid="case-panel"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[62%] flex-col border-t bg-background text-foreground shadow-lg sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[360px] sm:border-l sm:border-t-0"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{TAB_TITLE[tab]}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Close panel" onClick={onClose}>
          <IconX size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "item" ? (
          <Item
            board={board}
            caseId={caseId}
            selectedIds={selectedIds}
            {...(decideLocally ? { decideLocally } : {})}
          />
        ) : tab === "review" ? (
          <ReviewQueue
            board={board}
            caseId={caseId}
            onOpen={(id) => onSelect([id])}
            {...(decideLocally ? { decideLocally } : {})}
            {...(answerLocally ? { answerLocally } : {})}
          />
        ) : tab === "coverage" ? (
          <CoveragePanel coverage={board.coverage} />
        ) : tab === "patterns" ? (
          <ObservationsStrip
            observations={board.observations}
            nodes={board.nodes}
            onOpenNode={(id) => onSelect([id])}
          />
        ) : tab === "activity" ? (
          <ActivityLog rows={board.activity} />
        ) : tab === "brief" ? (
          <ExportButton board={board} caseId={caseId} sample={Boolean(decideLocally)} />
        ) : (
          <KnownListCheck board={board} />
        )}
      </div>
    </aside>
  );
}

const TOOLBAR: Array<{ tab: Exclude<PanelTab, "item">; label: string }> = [
  { tab: "review", label: "Review" },
  { tab: "coverage", label: "Searched" },
  { tab: "patterns", label: "Patterns" },
  { tab: "activity", label: "Activity" },
  { tab: "check", label: "Check list" },
  { tab: "brief", label: "Brief" },
];

/** The buttons that open the panels that are about the whole case. */
export function CaseToolbar({
  tab,
  onTab,
  patterns,
  review = 0,
}: {
  tab: PanelTab | null;
  onTab: (tab: PanelTab | null) => void;
  patterns: number;
  /** How many things wait for the person's answer. */
  review?: number;
}) {
  return (
    <div className="rs-toolbar" role="toolbar" aria-label="Case panels">
      {TOOLBAR.map((t) => (
        <button
          key={t.tab}
          type="button"
          aria-pressed={tab === t.tab}
          onClick={() => onTab(tab === t.tab ? null : t.tab)}
        >
          {t.label}
          {t.tab === "patterns" && patterns > 0 ? <span className="rs-toolbar-count">{patterns}</span> : null}
          {t.tab === "review" && review > 0 ? <span className="rs-toolbar-count">{review}</span> : null}
        </button>
      ))}
    </div>
  );
}
