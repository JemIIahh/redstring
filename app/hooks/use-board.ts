import { useActionQuery } from "@agent-native/core/client/use-action";

import type { Board, Observation } from "../../server/board/types";
import { sampleBoard, SAMPLE_CASE_ID } from "@/fixtures/laundromat-board";

export type CaseBoard = Board & { caseId: string; title: string; observations: Observation[] };

/**
 * The board for one case. The id `sample` is the built-in synthetic board, so
 * the page can be shown without an account, a case or a Companies House key.
 */
export function useBoard(caseId: string): {
  board: CaseBoard | undefined;
  refetch: () => void;
  isLoading: boolean;
  error: Error | null;
} {
  const sample = caseId === SAMPLE_CASE_ID;
  const query = useActionQuery("get-board", { caseId }, { enabled: !sample && caseId !== "" });
  if (sample) return { board: sampleBoard, refetch: () => {}, isLoading: false, error: null };
  return {
    board: query.data as CaseBoard | undefined,
    refetch: () => void query.refetch(),
    isLoading: query.isLoading,
    error: query.error,
  };
}
