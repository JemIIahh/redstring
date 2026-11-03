import { callAction } from "@agent-native/core/client/use-action";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityHit } from "../../../server/board/expand";

type Jurisdiction = "uk" | "us";
export type Seed = { companyNumber: string } | { cik: string; name: string };

export interface NewCaseProps {
  search?: (args: { query: string; jurisdiction: Jurisdiction }) => Promise<{
    hits: EntityHit[];
    note?: string;
  }>;
  create?: (args: { title: string; seeds: Seed[] }) => Promise<{ caseId: string }>;
  onCreated?: (caseId: string) => void;
}

const MAX_PICKS = 10;

const defaultSearch: NonNullable<NewCaseProps["search"]> = (args) =>
  callAction("search-entity", args, { method: "GET" });
const defaultCreate: NonNullable<NewCaseProps["create"]> = (args) =>
  callAction("create-case", args, { method: "POST", uiOnly: true });

const SOURCE_WORD: Record<EntityHit["source"], string> = {
  "companies-house": "Companies House",
  sec: "SEC",
  gleif: "GLEIF",
};

const hitId = (h: EntityHit) => `${h.source}:${h.key}`;

/** A case can only start from a company a register lets us read in full: Companies House or SEC. */
function seedFor(h: EntityHit): Seed | null {
  if (h.source === "companies-house") return { companyNumber: h.key };
  if (h.source === "sec") return { cik: h.key, name: h.name };
  return null;
}

/** The framework words a failure as "Action <name> failed: <reason>"; the person only needs the reason. */
function messageOf(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const reason = e.message.replace(/^Action [\w-]+ failed:\s*/, "").trim();
  return reason || fallback;
}

/**
 * Start a case: search a register by name, pick the companies, create.
 * Nothing is picked for the person and nothing is created until they press Create.
 */
export function NewCase({
  search = defaultSearch,
  create = defaultCreate,
  onCreated,
}: NewCaseProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("uk");
  const [phase, setPhase] = useState<"idle" | "searching" | "done">("idle");
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [note, setNote] = useState<string | undefined>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Only the latest search may fill the list: an older, slower answer is dropped.
  const searchSeq = useRef(0);
  const createLock = useRef(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const seq = ++searchSeq.current;
    setPhase("searching");
    setError(undefined);
    setPicked(new Set());
    try {
      const r = await search({ query: q, jurisdiction });
      if (seq !== searchSeq.current) return;
      setHits(r.hits);
      setNote(r.note);
      setPhase("done");
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setHits([]);
      setNote(undefined);
      setPhase("idle");
      setError(messageOf(err, "The search failed. Try again."));
    }
  }

  function toggle(h: EntityHit) {
    setPicked((prev) => {
      const next = new Set(prev);
      const id = hitId(h);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PICKS) next.add(id);
      return next;
    });
  }

  const chosen = hits.filter((h) => picked.has(hitId(h)));

  async function runCreate() {
    if (chosen.length === 0 || createLock.current) return;
    const seeds = chosen.map(seedFor).filter((s): s is Seed => s !== null);
    if (seeds.length === 0) return;
    const first = chosen[0]!.name;
    const title = (chosen.length > 1 ? `${first} +${chosen.length - 1}` : first).slice(0, 120);
    createLock.current = true;
    setCreating(true);
    setError(undefined);
    try {
      const r = await create({ title, seeds });
      onCreated?.(r.caseId);
    } catch (err) {
      setError(messageOf(err, "The case could not be created. Try again."));
    } finally {
      createLock.current = false;
      setCreating(false);
    }
  }

  const searching = phase === "searching";
  const noMatches = phase === "done" && hits.length === 0 && !note;

  return (
    <div className="flex w-full max-w-xl flex-col gap-5">
      <form onSubmit={runSearch} className="flex flex-col gap-3">
        <Label htmlFor={inputId}>Company name</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Quay Street Laundry"
            autoComplete="off"
          />
          <Button type="submit" disabled={searching || query.trim() === ""}>
            Search registers
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm" role="group" aria-label="Register">
          {(["uk", "us"] as const).map((j) => (
            <Button
              key={j}
              type="button"
              size="sm"
              variant={jurisdiction === j ? "default" : "outline"}
              aria-pressed={jurisdiction === j}
              onClick={() => setJurisdiction(j)}
            >
              {j === "uk" ? "UK" : "US"}
            </Button>
          ))}
          <span className="text-muted-foreground">
            {jurisdiction === "uk" ? "Companies House" : "SEC and GLEIF"}
          </span>
        </div>
      </form>

      {searching ? (
        <p className="text-sm text-muted-foreground" role="status">
          Searching…
        </p>
      ) : null}

      {noMatches ? (
        <p className="text-sm" role="status">
          No matches
        </p>
      ) : null}

      {phase === "done" && note ? (
        <p className="text-sm text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}

      {phase === "done" && hits.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {hits.map((h) => {
            const id = hitId(h);
            const startable = seedFor(h) !== null;
            const full = !picked.has(id) && picked.size >= MAX_PICKS;
            return (
              <li key={id}>
                <label
                  className={`flex items-start gap-3 px-3 py-2.5 ${startable ? "cursor-pointer" : "opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.has(id)}
                    disabled={!startable || full}
                    onChange={() => toggle(h)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{h.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[SOURCE_WORD[h.source], h.key, h.status, h.address]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {startable ? null : (
                      <span className="text-xs text-muted-foreground">
                        A case cannot start from this register alone.
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {phase === "done" && hits.length > 0 ? (
        <div className="flex items-center gap-3">
          <Button type="button" disabled={chosen.length === 0 || creating} onClick={runCreate}>
            {creating
              ? "Creating…"
              : chosen.length > 1
                ? `Create case from ${chosen.length} companies`
                : "Create case"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Nothing is added until you press Create.
          </span>
        </div>
      ) : null}
    </div>
  );
}
