import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { checkKnownList } from "../../../server/board/known-list";
import type { Board } from "../../../server/board/types";

/**
 * Paste a published list of companies (OCCRP's, for instance) and see which are already on
 * the board. A name that is not there has simply not been searched or pinned yet.
 */
export function KnownListCheck({ board }: { board: Pick<Board, "nodes"> }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReturnType<typeof checkKnownList> | null>(null);
  const total = result ? result.found.length + result.missing.length : 0;

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(checkKnownList(text.split(/\r?\n/), board));
        }}
      >
        <Label htmlFor="rs-known-list">Paste the published list, one company per line</Label>
        <textarea
          id="rs-known-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
        />
        <div>
          <Button type="submit" size="sm" disabled={text.trim() === ""}>
            Check list
          </Button>
        </div>
      </form>

      {result ? (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          <p className="font-medium">
            {result.found.length} of {total} are on this board
          </p>
          {result.found.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">On this board</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {result.found.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.missing.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Not on this board</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {result.missing.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                A name missing here has not been searched or pinned yet. It says nothing about the company.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
