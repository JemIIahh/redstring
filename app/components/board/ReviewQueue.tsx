import { useActionMutation, useActionQuery } from "@agent-native/core/client/use-action";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { CaseBoard, LocalAnswer } from "@/hooks/use-board";
import { useGuarded, type Guard } from "@/hooks/use-guarded";
import type { SnapshotWatchesResult } from "../../../actions/snapshot-watches";
import type { Change } from "../../../server/board/types";
import { plainError } from "./labels";
import type { SetStatusArgs } from "./StatusControls";
import { EDGE_WORDS } from "./StringEdge";

/** A card or string the agent pinned and the person has not yet decided on. */
export interface QueueProposal {
  id: string;
  kind: "node" | "edge";
  title: string;
}

/** The agent's suggestion to take another look at an item. It never carries a verdict. */
export interface QueueSuggestion {
  id: string;
  targetId: string;
  targetTitle: string;
  reason: string;
}

/** A change found on a watched company, waiting for the person to accept or dismiss it. */
export interface QueueChange {
  id: string;
  kind: Change["kind"];
  summary: string;
  companyLabel: string;
  createdAt: string;
}

type Decision = "accept" | "dismiss";

/** A date as the page writes dates. UTC, so the same record reads the same in every timezone. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What a re-check did, in lines safe to show: what was read, what could not be read, and where
 * it stopped. It never says "all clear" for a company it did not read.
 */
export function describeRecheck(r: SnapshotWatchesResult): string[] {
  if (r.watches === 0) return ["No company is being watched."];
  const lines: string[] = [];
  const read = r.watches - r.failed.length - r.notChecked.length;
  if (read > 0) {
    const parts: string[] = [];
    if (r.baselines > 0) parts.push(`${r.baselines} read for the first time, the starting point for later checks`);
    if (r.changes > 0) parts.push(`${r.changes} new ${plural(r.changes, "change", "changes")} to review`);
    if (r.unchanged > 0) parts.push(`${r.unchanged} with nothing new`);
    lines.push(
      `Checked ${read} of ${r.watches} ${plural(r.watches, "company", "companies")}${parts.length ? `: ${parts.join("; ")}` : ""}.`,
    );
  }
  for (const f of r.failed) lines.push(`Could not read ${f.companyNumber}: ${f.reason}`);
  if (r.stoppedEarly) {
    const rest = r.notChecked.length > 0 ? ` Not checked: ${r.notChecked.join(", ")}.` : "";
    lines.push(`Stopped early: ${r.stoppedEarly}${rest}`);
  }
  return lines;
}

function Row({ children, actions }: { children: ReactNode; actions: (guard: Guard) => ReactNode }) {
  const guard = useGuarded();
  return (
    <li className="flex flex-col gap-2 border-b py-3 text-sm last:border-b-0">
      <div className="flex flex-col gap-0.5">{children}</div>
      <div className="flex flex-wrap gap-2">{actions(guard)}</div>
      {guard.error ? (
        <p className="text-sm text-destructive" role="alert">
          {guard.error}
        </p>
      ) : null}
    </li>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {children}
    </section>
  );
}

export interface ReviewQueueViewProps {
  proposals: QueueProposal[];
  suggestions: QueueSuggestion[];
  changes: QueueChange[];
  /** How many companies in this case are watched. */
  watching: number;
  /** When a watched company was last read; null if none has been. */
  lastCheckedAt: string | null;
  onConfirm: (proposal: QueueProposal) => Promise<unknown>;
  onOpen: (id: string) => void;
  onReviewChange: (changeId: string, decision: Decision) => Promise<unknown>;
  onReviewSuggestion: (suggestionId: string, decision: Decision) => Promise<unknown>;
  onRecheck?: () => Promise<SnapshotWatchesResult>;
}

function RecheckButton({ onRecheck }: { onRecheck: () => Promise<SnapshotWatchesResult> }) {
  const guard = useGuarded();
  const [lines, setLines] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={guard.busy}
          onClick={() =>
            void guard.run(async () => {
              setLines([]);
              setLines(describeRecheck(await onRecheck()));
            })
          }
        >
          Re-check now
        </Button>
      </div>
      {lines.length > 0 ? (
        <div role="status" className="flex flex-col gap-1 text-sm">
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      ) : null}
      {guard.error ? (
        <p className="text-sm text-destructive" role="alert">
          {guard.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Everything waiting for the person's answer: what the agent pinned, what it suggested looking
 * at again, and what changed on watched companies. Answering a suggestion or a change never
 * alters a card; only Confirm on a proposal does, and rejecting happens on the card itself,
 * where a reason is asked for.
 */
export function ReviewQueueView({
  proposals,
  suggestions,
  changes,
  watching,
  lastCheckedAt,
  onConfirm,
  onOpen,
  onReviewChange,
  onReviewSuggestion,
  onRecheck,
}: ReviewQueueViewProps) {
  const nothingWaiting = proposals.length === 0 && suggestions.length === 0 && changes.length === 0;

  let watchLine: string;
  if (watching === 0) {
    watchLine = "You are not watching any company in this case. Select a UK company card and choose Watch.";
  } else if (!lastCheckedAt) {
    watchLine = "Not checked yet";
  } else if (changes.length === 0) {
    watchLine = `No changes since ${formatDay(lastCheckedAt)}`;
  } else {
    watchLine = `Last checked ${formatDay(lastCheckedAt)}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Watched companies">
        <p className="text-sm">{watchLine}</p>
        {onRecheck && watching > 0 ? <RecheckButton onRecheck={onRecheck} /> : null}
      </Section>

      {changes.length > 0 ? (
        <Section title="Changes" note="Accepting only marks a change as seen. Nothing on the board changes.">
          <ul aria-label="Changes">
            {changes.map((c) => (
              <Row
                key={c.id}
                actions={({ busy, run }) => (
                  <>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => onReviewChange(c.id, "accept"))}>
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(() => onReviewChange(c.id, "dismiss"))}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
              >
                <span className="font-medium">{c.summary}</span>
                <span className="text-xs text-muted-foreground">
                  {c.companyLabel} · found {formatDay(c.createdAt)}
                </span>
              </Row>
            ))}
          </ul>
        </Section>
      ) : null}

      {proposals.length > 0 ? (
        <Section title="Proposed by the agent" note="Nothing here is on the board as settled until you confirm it.">
          <ul aria-label="Proposed by the agent">
            {proposals.map((p) => (
              <Row
                key={p.id}
                actions={({ busy, run }) => (
                  <>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => onConfirm(p))}>
                      Confirm
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(p.id)}>
                      Open
                    </Button>
                  </>
                )}
              >
                <span className="font-medium">{p.title}</span>
                <span className="text-xs text-muted-foreground">{p.kind === "node" ? "Card" : "String"}</span>
              </Row>
            ))}
          </ul>
        </Section>
      ) : null}

      {suggestions.length > 0 ? (
        <Section
          title="Suggestions"
          note="The agent suggests another look. Answering does not change the card; reject it on the card if you decide to."
        >
          <ul aria-label="Suggestions">
            {suggestions.map((s) => (
              <Row
                key={s.id}
                actions={({ busy, run }) => (
                  <>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => onReviewSuggestion(s.id, "accept"))}>
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(() => onReviewSuggestion(s.id, "dismiss"))}
                    >
                      Dismiss
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(s.targetId)}>
                      Open
                    </Button>
                  </>
                )}
              >
                <span className="font-medium">Another look at {s.targetTitle}</span>
                <span className="text-sm">{s.reason}</span>
              </Row>
            ))}
          </ul>
        </Section>
      ) : null}

      {nothingWaiting ? <p className="text-sm text-muted-foreground">Nothing is waiting for your answer.</p> : null}
    </div>
  );
}

function titleOf(board: CaseBoard, id: string): string {
  const node = board.nodes.find((n) => n.id === id);
  if (node) return node.label;
  const edge = board.edges.find((e) => e.id === id);
  if (!edge) return "an item";
  const label = (nodeId: string) => board.nodes.find((n) => n.id === nodeId)?.label ?? "an item";
  return `${label(edge.fromId)} · ${EDGE_WORDS[edge.type]} · ${label(edge.toId)}`;
}

/** Cards and strings the agent pinned that the person has not yet decided on. */
export function queueProposals(board: CaseBoard): QueueProposal[] {
  return [
    ...board.nodes
      .filter((n) => n.status === "proposed" && n.addedBy === "agent")
      .map((n): QueueProposal => ({ id: n.id, kind: "node", title: n.label })),
    ...board.edges
      .filter((e) => e.status === "proposed" && e.addedBy === "agent")
      .map((e): QueueProposal => ({ id: e.id, kind: "edge", title: titleOf(board, e.id) })),
  ];
}

/** Suggestions still waiting for an answer. */
export function queueSuggestions(board: CaseBoard): QueueSuggestion[] {
  return board.suggestions
    .filter((s) => s.status === "open")
    .map((s): QueueSuggestion => ({
      id: s.id,
      targetId: s.targetId,
      targetTitle: titleOf(board, s.targetId),
      reason: s.reason,
    }));
}

/** Which company a change is about, as `list-changes` reports it. */
export type ChangeCompany = { nodeId?: string; companyNumber?: string };

/**
 * Changes still waiting for an answer, from the board itself so the list and the toolbar count
 * can never disagree. `companies` (from `list-changes`) says whose each one is.
 */
export function queueChanges(board: CaseBoard, companies: Record<string, ChangeCompany> = {}): QueueChange[] {
  return board.changes
    .filter((c) => c.status === "pending")
    .map((c): QueueChange => {
      const who = companies[c.id];
      const label =
        (who?.nodeId ? board.nodes.find((n) => n.id === who.nodeId)?.label : undefined) ??
        who?.companyNumber ??
        "A watched company";
      return { id: c.id, kind: c.kind, summary: c.summary, companyLabel: label, createdAt: c.createdAt };
    });
}

/** How many things wait for the person, for the count on the toolbar: exactly the rows the queue lists. */
export function reviewCount(board: CaseBoard): number {
  return queueProposals(board).length + queueSuggestions(board).length + queueChanges(board).length;
}

interface Props {
  board: CaseBoard;
  caseId: string;
  onOpen: (id: string) => void;
  /** The sample board decides and answers in memory; a real case saves through the actions. */
  decideLocally?: (args: SetStatusArgs) => Promise<unknown>;
  answerLocally?: (answer: LocalAnswer) => Promise<unknown>;
}

/** The queue wired to the actions. A saved answer refreshes the board and the changes. */
export function ReviewQueue({ board, caseId, onOpen, decideLocally, answerLocally }: Props) {
  const sample = Boolean(decideLocally);
  const watch = useActionQuery("list-changes", { caseId }, { enabled: !sample });
  const setStatus = useActionMutation("set-status", { uiOnly: true });
  const reviewChange = useActionMutation("review-change", { uiOnly: true });
  const reviewSuggestion = useActionMutation("review-suggestion", { uiOnly: true });
  const recheck = useActionMutation("snapshot-watches");

  if (!sample && watch.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!sample && watch.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {plainError(watch.error, "What is waiting could not be read. Try again.")}
      </p>
    );
  }

  const data = watch.data as
    | {
        changes: Array<{ id: string } & ChangeCompany>;
        watching: number;
        lastCheckedAt: string | null;
      }
    | undefined;

  const companies = Object.fromEntries((data?.changes ?? []).map((c) => [c.id, c]));
  // The sample is a finished picture with its own invented watch: read it off its changes.
  const watching = sample ? new Set(board.changes.map((c) => c.watchId)).size : (data?.watching ?? 0);
  const found = board.changes.map((c) => c.createdAt).sort();
  const lastCheckedAt = sample ? (found[found.length - 1] ?? null) : (data?.lastCheckedAt ?? null);

  return (
    <ReviewQueueView
      proposals={queueProposals(board)}
      suggestions={queueSuggestions(board)}
      changes={queueChanges(board, companies)}
      watching={watching}
      lastCheckedAt={lastCheckedAt}
      onConfirm={(p) => {
        const args: SetStatusArgs = { caseId, targetKind: p.kind, targetId: p.id, to: "confirmed" };
        return decideLocally ? decideLocally(args) : setStatus.mutateAsync(args as never);
      }}
      onOpen={onOpen}
      onReviewChange={(changeId, decision) =>
        answerLocally
          ? answerLocally({ kind: "change", id: changeId, decision })
          : reviewChange.mutateAsync({ caseId, changeId, decision } as never)
      }
      onReviewSuggestion={(suggestionId, decision) =>
        answerLocally
          ? answerLocally({ kind: "suggestion", id: suggestionId, decision })
          : reviewSuggestion.mutateAsync({ caseId, suggestionId, decision } as never)
      }
      {...(sample ? {} : { onRecheck: () => recheck.mutateAsync({} as never) as Promise<SnapshotWatchesResult> })}
    />
  );
}
