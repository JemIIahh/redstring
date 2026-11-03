import { IconSparkles, IconUser } from "@tabler/icons-react";

import type { ActivityRow } from "../../../server/board/types";
import { STATUS_WORD } from "./NodeCard";

const PHRASE: Record<string, string> = {
  "create-case": "Started the case",
  expand: "Looked up records",
  "expand-node": "Looked up records",
  "expand-incomplete": "Looked up records, some not read",
  "expand-refused": "A lookup was refused",
  "check-leaks": "Checked Offshore Leaks",
  "check-leaks-refused": "An Offshore Leaks check was refused",
  "suggest-reject": "Suggested rejecting an item",
  annotate: "Added a note",
  "pin-item": "Pinned an item",
  "review-change": "Answered a change",
  "review-suggestion": "Answered a suggestion",
  watch: "Started watching a company",
  "watch-baseline": "Recorded a starting point",
  "watch-change": "Found a change",
  "agent-run": "Agent run",
};

/** What a row says happened, and any detail worth showing beside it. */
export function describeActivity(row: Pick<ActivityRow, "kind" | "detail">): { phrase: string; extra?: string } {
  if (row.kind === "set-status") {
    const [to = "", ...rest] = (row.detail ?? "").split(":");
    const word = STATUS_WORD[to.trim() as keyof typeof STATUS_WORD] ?? to.trim();
    const reason = rest.join(":").trim();
    return {
      phrase: word ? `Marked an item ${word}` : "Changed an item's status",
      ...(reason ? { extra: reason } : {}),
    };
  }
  const phrase = PHRASE[row.kind] ?? row.kind.replace(/-/g, " ");
  return { phrase, ...(row.detail ? { extra: row.detail } : {}) };
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Everything done on the case, newest first. The agent's rows carry its mark; yours carry yours. */
export function ActivityLog({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  const newestFirst = [...rows].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ul aria-label="Activity" className="flex flex-col">
      {newestFirst.map((r) => {
        const agent = r.actor === "agent";
        const { phrase, extra } = describeActivity(r);
        return (
          <li
            key={r.id}
            data-actor={r.actor}
            className={`flex gap-2 border-b py-2.5 text-sm last:border-b-0 ${agent ? "border-l-2 border-l-teal-600 pl-2" : "pl-0"}`}
          >
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center ${agent ? "rounded-[3px] bg-teal-700 text-white" : "rounded-full bg-foreground text-background"}`}
              aria-hidden="true"
            >
              {agent ? <IconSparkles size={11} stroke={2} /> : <IconUser size={11} stroke={2} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span>
                <span className="font-medium">{agent ? "Agent" : "You"}</span> · {phrase}
              </span>
              {extra ? <span className="truncate text-xs text-muted-foreground">{extra}</span> : null}
              <time dateTime={r.at} className="text-xs text-muted-foreground" title={agent ? `via ${r.caller}` : undefined}>
                {when(r.at)}
              </time>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
