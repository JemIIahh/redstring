import type { CoverageRow } from "../../../server/board/types";
import { COVERAGE_WORD, sourceLabel } from "./labels";

/**
 * What each source was asked and what it said. "no match" means the source answered and
 * found nothing; it is never styled or worded as a fault.
 */
export function CoveragePanel({ coverage }: { coverage: CoverageRow[] }) {
  if (coverage.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has been searched yet.</p>;
  }
  return (
    <ul aria-label="What was searched" className="flex flex-col gap-3">
      {coverage.map((c) => (
        <li key={`${c.source}:${c.subjectId ?? ""}`} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{sourceLabel(c.source)}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${
                c.state === "incomplete" || c.state === "not_read" || c.state === "not_available"
                  ? "border-amber-600/40 text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              }`}
              data-state={c.state}
            >
              {COVERAGE_WORD[c.state]}
            </span>
          </div>
          {c.note ? <p className="text-xs text-muted-foreground">{c.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
