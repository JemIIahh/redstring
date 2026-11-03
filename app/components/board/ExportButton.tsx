import { useActionMutation } from "@agent-native/core/client/use-action";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CaseBoard } from "@/hooks/use-board";
import { useGuarded } from "@/hooks/use-guarded";
import { buildSampleBrief } from "../../../server/board/brief";

export interface BriefResult {
  markdown: string;
  citations: number;
  unconfirmed: number;
}

/** A plain file name for a case's brief. */
export function slugFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${slug || "case"}-brief.md`;
}

/** Hands the text to the browser as a file. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface ViewProps {
  makeBrief: () => Promise<BriefResult>;
  filename: string;
  download?: (name: string, text: string) => void;
  /** Changes whenever the board does. A brief made before that is dropped, not offered as current. */
  stamp: string;
}

/**
 * Makes the brief, shows it, and hands it over as a file. The person reads the same text that is
 * downloaded.
 */
export function ExportButtonView({ makeBrief, filename, download = downloadText, stamp }: ViewProps) {
  const guard = useGuarded();
  const [brief, setBrief] = useState<BriefResult | undefined>();
  const latest = useRef(stamp);
  latest.current = stamp;

  useEffect(() => {
    setBrief(undefined);
  }, [stamp]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every line points at the public record it came from. Anything not yet confirmed is kept apart, and what you ruled out is
        listed with your reasons.
      </p>
      <div>
        <Button
          type="button"
          size="sm"
          disabled={guard.busy}
          onClick={() =>
            void guard.run(async () => {
              const madeFor = stamp;
              const made = await makeBrief();
              // The board moved on while this was being written: that brief is already out of date.
              if (latest.current === madeFor) setBrief(made);
            })
          }
        >
          Make brief
        </Button>
      </div>
      {guard.error ? (
        <p className="text-sm text-destructive" role="alert">
          {guard.error}
        </p>
      ) : null}
      {brief ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {plural(brief.citations, "source", "sources")} ·{" "}
            {brief.unconfirmed === 0
              ? "nothing unconfirmed"
              : `${plural(brief.unconfirmed, "unconfirmed item", "unconfirmed items")} kept apart`}
          </p>
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => download(filename, brief.markdown)}>
              Download .md
            </Button>
          </div>
          <pre
            aria-label="Brief"
            tabIndex={0}
            className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
          >
            {brief.markdown}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The brief wired up. A real case asks `export-brief` (which also leaves a line on the case); the
 * sample board has no account behind it, so its brief is written on the spot from what is on screen.
 */
export function ExportButton({ board, caseId, sample }: { board: CaseBoard; caseId: string; sample: boolean }) {
  const exportBrief = useActionMutation("export-brief", { uiOnly: true });
  const stamp = JSON.stringify([
    board.nodes.map((n) => [n.id, n.status, n.reason ?? ""]),
    board.edges.map((e) => [e.id, e.status, e.reason ?? ""]),
    board.coverage.length,
  ]);
  return (
    <ExportButtonView
      stamp={stamp}
      filename={slugFilename(board.title)}
      makeBrief={async () =>
        sample
          ? buildSampleBrief(board, { title: board.title, generatedAt: new Date().toISOString() })
          : ((await exportBrief.mutateAsync({ caseId } as never)) as BriefResult)
      }
    />
  );
}
