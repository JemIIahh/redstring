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

export type LocalAnswer = { kind: "change" | "suggestion"; id: string; decision: "accept" | "dismiss" };

/** Answer one change or suggestion in a copy of the board. No card or string is touched. */
export function applyAnswer(board: CaseBoard, a: LocalAnswer): CaseBoard {
  const status = a.decision === "accept" ? ("accepted" as const) : ("dismissed" as const);
  const known =
    a.kind === "change" ? board.changes.some((c) => c.id === a.id) : board.suggestions.some((s) => s.id === a.id);
  if (!known) return board;
  return {
    ...board,
    changes: a.kind === "change" ? board.changes.map((c) => (c.id === a.id ? { ...c, status } : c)) : board.changes,
    suggestions:
      a.kind === "suggestion" ? board.suggestions.map((s) => (s.id === a.id ? { ...s, status } : s)) : board.suggestions,
    activity: [
      ...board.activity,
      {
        id: `local-${board.activity.length + 1}`,
        caseId: board.caseId,
        actor: "person" as const,
        caller: "frontend",
        kind: a.kind === "change" ? "review-change" : "review-suggestion",
        targetId: a.id,
        detail: status,
        at: new Date().toISOString(),
      },
    ],
  };
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
  answerLocally?: (answer: LocalAnswer) => Promise<void>;
} {
  const sample = caseId === SAMPLE_CASE_ID;
  const [local, setLocal] = useState<CaseBoard>(sampleBoard);
  const decideLocally = useCallback(async (a: SetStatusArgs) => {
    setLocal((prev) => decide(prev, a));
  }, []);
  const answerLocally = useCallback(async (a: LocalAnswer) => {
    setLocal((prev) => applyAnswer(prev, a));
  }, []);
  const query = useActionQuery("get-board", { caseId }, { enabled: !sample && caseId !== "" });

  return useMemo(
    () =>
      sample
        ? { board: local, refetch: () => {}, isLoading: false, error: null, decideLocally, answerLocally }
        : {
            board: query.data as CaseBoard | undefined,
            refetch: () => void query.refetch(),
            isLoading: query.isLoading,
            error: query.error,
          },
    [sample, local, decideLocally, answerLocally, query.data, query.isLoading, query.error, query],
  );
}
