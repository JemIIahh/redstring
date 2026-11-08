import { setClientAppState } from "@agent-native/core/client/application-state";
import { useEffect } from "react";

import { TAB_ID } from "@/lib/tab-id";

export interface SelectionState {
  caseId: string;
  /** Ids of the selected cards and strings, in the order they were picked. Nothing else: the agent reads the details with get-board. */
  ids: string[];
}

/** What the agent is told is selected. Null when nothing is, so a stale selection is never reported. */
export function selectionStateFor(caseId: string, ids: readonly string[]): SelectionState | null {
  const clean = [...new Set(ids.filter((id) => id !== ""))];
  return clean.length > 0 ? { caseId, ids: clean } : null;
}

/** Selection belongs to this tab; another tab must not overwrite or clear it. */
export function selectionKeys(tabId: string | undefined): string[] {
  return [tabId ? `selection:${tabId}` : "selection"];
}

/**
 * Keep application-state `selection` in step with the board, so "this one" means what the
 * person has clicked. Cleared when the case page closes.
 */
export function useSelectionState(caseId: string, ids: readonly string[]) {
  const signature = ids.join("\u0000");
  useEffect(() => {
    if (!caseId) return;
    const value = selectionStateFor(caseId, signature === "" ? [] : signature.split("\u0000"));
    const timer = setTimeout(() => {
      for (const key of selectionKeys(TAB_ID)) {
        void setClientAppState(key, value, { keepalive: true, requestSource: TAB_ID }).catch(() => {});
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [caseId, signature]);

  useEffect(() => {
    if (!caseId) return;
    return () => {
      for (const key of selectionKeys(TAB_ID)) {
        void setClientAppState(key, null, { keepalive: true, requestSource: TAB_ID }).catch(() => {});
      }
    };
  }, [caseId]);
}
