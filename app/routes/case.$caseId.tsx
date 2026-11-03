import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { useState } from "react";
import { useParams } from "react-router";

import { BoardCanvas } from "@/components/board/BoardCanvas";
import { ThreadLegend } from "@/components/board/ThreadLegend";
import { SAMPLE_CASE_ID, SAMPLE_TITLE } from "@/fixtures/laundromat-board";
import { useBoard } from "@/hooks/use-board";

export function meta() {
  return [{ title: "Case - Redstring" }];
}

export default function CasePage() {
  const { caseId = "" } = useParams();
  const { board, isLoading, error } = useBoard(caseId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sample = caseId === SAMPLE_CASE_ID;

  useSetPageTitle(
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{sample ? SAMPLE_TITLE : "Case"}</span>
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
      <BoardCanvas board={board} selectedIds={selectedIds} onSelect={setSelectedIds} />
      <ThreadLegend />
    </div>
  );
}
