import { useActionQuery } from "@agent-native/core/client/use-action";
import { useCallback, useMemo, useState } from "react";

import { computeObservations } from "../../server/board/observations";
import type { Board, Observation } from "../../server/board/types";
import type { SetStatusArgs } from "@/components/board/StatusControls";
import { sampleBoard, SAMPLE_CASE_ID } from "@/fixtures/laundromat-board";

export type CaseBoard = Board & { caseId: string; title: string; observations: Observation[] };

/** Change one item's status in a copy of the board, the way the server would record it. */
function decide(board: CaseBoard, a: SetStatusArgs): CaseBoard {
  const apply = <T extends { id: string; status: string; reason?: string }>(item: T): T => {
    if (item.id !== a.targetId) return item;
    const { reason: _old, ...rest } = item;
    return { ...(rest as T), status: a.to, ...(a.reason ? { reason: a.reason } : {}) };
  };
  const next = {
    ...board,
    nodes: a.targetKind === "node" ? board.nodes.map(apply) : board.nodes,
    edges: a.targetKind === "edge" ? board.edges.map(apply) : board.edges,
    activity: [
      ...board.activity,
      {
        id: `local-${board.activity.length + 1}`,
        caseId: board.caseId,
        actor: "person" as const,
        caller: "frontend",
        kind: "set-status",
        targetId: a.targetId,
        detail: a.reason ? `${a.to}: ${a.reason}` : a.to,
        at: new Date().toISOString(),
      },
    ],
  };
  return { ...next, observations: computeObservations(next) };
}

/**
 * The board for one case. The id `sample` is the built-in synthetic board, so the page can
 * be shown without an account, a case or a Companies House key; decisions on it are kept in
 * memory only (`decideLocally`) and are gone on reload.
 */
export function useBoard(caseId: string): {
  board: CaseBoard | undefined;
  refetch: () => void;
  isLoading: boolean;
  error: Error | null;
  decideLocally?: (args: SetStatusArgs) => Promise<void>;
} {
  const sample = caseId === SAMPLE_CASE_ID;
  const [local, setLocal] = useState<CaseBoard>(sampleBoard);
  const decideLocally = useCallback(async (a: SetStatusArgs) => {
    setLocal((prev) => decide(prev, a));
  }, []);
  const query = useActionQuery("get-board", { caseId }, { enabled: !sample && caseId !== "" });

  return useMemo(
    () =>
      sample
        ? { board: local, refetch: () => {}, isLoading: false, error: null, decideLocally }
        : {
            board: query.data as CaseBoard | undefined,
            refetch: () => void query.refetch(),
            isLoading: query.isLoading,
            error: query.error,
          },
    [sample, local, decideLocally, query.data, query.isLoading, query.error, query],
  );
}
