import { useActionMutation } from "@agent-native/core/client/use-action";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Status } from "../../../server/board/types";
import { plainError } from "./labels";

export interface StatusTarget {
  kind: "node" | "edge";
  id: string;
  status: Status;
}

export type SetStatusArgs = {
  caseId: string;
  targetKind: "node" | "edge";
  targetId: string;
  to: Status;
  reason?: string;
};

interface ViewProps {
  caseId: string;
  target: StatusTarget;
  setStatus: (args: SetStatusArgs) => Promise<unknown>;
  onDone?: () => void;
}

const ASKS: Record<"rejected" | "dead-end", { open: string; submit: string }> = {
  rejected: { open: "Reject", submit: "Reject" },
  "dead-end": { open: "Dead end", submit: "Mark as dead end" },
};

/**
 * The person's decisions on one card or string. Rejecting or marking a dead end needs a
 * reason, which then shows on the card; confirming does not. Only the person gets these.
 */
export function StatusControlsView({ caseId, target, setStatus, onDone }: ViewProps) {
  const [asking, setAsking] = useState<null | "rejected" | "dead-end">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // A different item, or a changed status, starts fresh.
  useEffect(() => {
    setAsking(null);
    setReason("");
    setError(undefined);
  }, [target.id, target.status]);

  async function apply(to: Status, why?: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await setStatus({
        caseId,
        targetKind: target.kind,
        targetId: target.id,
        to,
        ...(why ? { reason: why } : {}),
      });
      setAsking(null);
      setReason("");
      onDone?.();
    } catch (e) {
      setError(plainError(e, "That could not be saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const word = target.kind === "node" ? "card" : "string";

  if (asking) {
    const ask = ASKS[asking];
    const trimmed = reason.trim();
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) void apply(asking, trimmed);
        }}
      >
        <Label htmlFor="rs-reason">Why? It will show on the {word}.</Label>
        <textarea
          id="rs-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || trimmed === ""}>
            {ask.submit}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(null)}>
            Cancel
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {target.status !== "confirmed" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void apply("confirmed")}>
            Confirm
          </Button>
        ) : null}
        {target.status !== "rejected" ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsking("rejected")}>
            Reject
          </Button>
        ) : null}
        {target.status !== "dead-end" ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsking("dead-end")}>
            Dead end
          </Button>
        ) : null}
        {target.status !== "proposed" ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void apply("proposed")}>
            Back to proposed
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The controls wired to `set-status`. A saved change refreshes the board. */
export function StatusControls(props: Omit<ViewProps, "setStatus">) {
  const mutation = useActionMutation("set-status", { uiOnly: true });
  return (
    <StatusControlsView
      {...props}
      setStatus={(args) => mutation.mutateAsync(args as never)}
    />
  );
}
