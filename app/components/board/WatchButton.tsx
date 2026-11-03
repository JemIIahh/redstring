import { useActionMutation, useActionQuery } from "@agent-native/core/client/use-action";

import { Button } from "@/components/ui/button";
import { useGuarded } from "@/hooks/use-guarded";
import type { BoardNode } from "../../../server/board/types";

/** Only a UK company can be watched: its changes are read from Companies House by company number. */
export function canWatch(node: Pick<BoardNode, "type" | "facts">): boolean {
  return node.type === "company" && node.facts.jurisdiction === "uk";
}

export function WatchButtonView({ watched, onWatch }: { watched: boolean; onWatch: () => Promise<unknown> }) {
  const guard = useGuarded();
  if (watched) return <p className="text-sm text-muted-foreground">Watching for changes</p>;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" size="sm" variant="outline" disabled={guard.busy} onClick={() => void guard.run(onWatch)}>
          Watch for changes
        </Button>
      </div>
      {guard.error ? (
        <p className="text-sm text-destructive" role="alert">
          {guard.error}
        </p>
      ) : null}
    </div>
  );
}

/** Wired to `watch-entity`. A saved watch refreshes `list-changes`, so the button turns into "Watching". */
export function WatchButton({ caseId, nodeId }: { caseId: string; nodeId: string }) {
  const state = useActionQuery("list-changes", { caseId });
  const watch = useActionMutation("watch-entity", { uiOnly: true });
  const watchedIds = (state.data as { watchedNodeIds?: string[] } | undefined)?.watchedNodeIds ?? [];
  // Until the list has loaded we do not know, so offer nothing rather than a button that may be wrong.
  if (state.isLoading || state.error) return null;
  return (
    <WatchButtonView
      watched={watchedIds.includes(nodeId)}
      onWatch={() => watch.mutateAsync({ caseId, nodeId } as never)}
    />
  );
}
