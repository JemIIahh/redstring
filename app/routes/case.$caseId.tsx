import { callAction } from "@agent-native/core/client/use-action";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { BoardCanvas } from "@/components/board/BoardCanvas";
import { ThreadLegend } from "@/components/board/ThreadLegend";
import { SAMPLE_CASE_ID, SAMPLE_TITLE } from "@/fixtures/laundromat-board";
import { useBoard } from "@/hooks/use-board";
import { useSelectionState } from "@/hooks/use-selection-state";

export function meta() {
  return [{ title: "Case - Redstring" }];
}

export default function CasePage() {
  const { caseId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { board, isLoading, error } = useBoard(caseId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sample = caseId === SAMPLE_CASE_ID;

  // ?node= is the address of one card: the agent's "show me this", or a shared link.
  const nodeParam = searchParams.get("node")?.trim() || undefined;
  const focusId = useMemo(
    () => (nodeParam && board?.nodes.some((n) => n.id === nodeParam) ? nodeParam : undefined),
    [nodeParam, board],
  );
  useEffect(() => {
    if (focusId) setSelectedIds([focusId]);
  }, [focusId]);

  // The agent's "this one" is whatever is selected here. The sample board is not a real
  // case, so it reports nothing.
  useSelectionState(sample ? "" : caseId, selectedIds);

  const title = sample ? SAMPLE_TITLE : (board?.title ?? "Case");
  useSetPageTitle(
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{title}</span>
      {sample ? <span className="rs-sample-chip">sample data</span> : null}
    </span>,
  );

  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">That case could not be opened.</p>;
  }
  if (!board || isLoading) {
    return <div className="rs-board h-full w-full" aria-busy="true" />;
  }

  return (
    <div className="relative h-full w-full">
      <BoardCanvas
        board={board}
        selectedIds={selectedIds}
        onSelect={setSelectedIds}
        {...(focusId ? { focusId } : {})}
        {...(sample
          ? {}
          : {
              onMove: (nodeId: string, x: number, y: number) => {
                callAction("move-node", { caseId, nodeId, x, y }, { method: "POST", uiOnly: true }).catch(
                  () => toast.error("Could not save where that card sits."),
                );
              },
            })}
      />
      <ThreadLegend />
    </div>
  );
}
