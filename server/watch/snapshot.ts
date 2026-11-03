import type { Change, Snapshot } from "../board/types.js";
import { contentHash } from "../sources/hash.js";
import type { Sources } from "../sources/registry.js";

export type { Snapshot };

/** Page size for the watched lists; the register's own total is kept for counting. */
const LIST_CAP = 100;

const byKey = <T>(key: (x: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

/**
 * Reads a company's officers, controllers and filings and reduces each to a
 * hash of the fields that matter, sorted so the register's ordering never
 * counts as a change. If any read fails the whole snapshot fails: a missing
 * list must never look like "everyone resigned".
 */
export async function takeSnapshot(
  s: Sources,
  companyNumber: string,
  deps: { now?: () => Date } = {},
): Promise<Snapshot> {
  const officers = await s.ch.getOfficers(companyNumber, { cap: LIST_CAP });
  const controllers = await s.ch.getControllers(companyNumber);
  const filings = await s.ch.getFilings(companyNumber, { cap: LIST_CAP });

  return {
    officersHash: contentHash(
      officers.data
        .map((o) => ({
          id: o.officerId,
          role: o.role,
          appointedOn: o.appointedOn ?? null,
          resignedOn: o.resignedOn ?? null,
        }))
        .sort(byKey((o) => `${o.id}|${o.role}|${o.appointedOn}`)),
    ),
    controllersHash: contentHash(
      controllers.data
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          notifiedOn: c.notifiedOn ?? null,
          ceasedOn: c.ceasedOn ?? null,
          natures: [...c.natures].sort(),
        }))
        .sort(byKey((c) => c.id)),
    ),
    filingsHash: contentHash(filings.data.map((f) => f.transactionId).sort()),
    // The register's total when it says so: a capped list stops growing at the cap.
    filingCount: filings.total ?? filings.data.length,
    takenAt: (deps.now ?? (() => new Date()))().toISOString(),
  };
}

/**
 * What changed between an earlier snapshot and a later one. Summaries are
 * counts or plain statements, never a judgement about what the change means.
 */
export function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
): Array<Pick<Change, "kind" | "summary">> {
  const out: Array<Pick<Change, "kind" | "summary">> = [];
  if (before.officersHash !== after.officersHash) {
    out.push({ kind: "officers", summary: "The officers list changed" });
  }
  if (before.controllersHash !== after.controllersHash) {
    out.push({ kind: "controllers", summary: "The list of people with significant control changed" });
  }
  if (before.filingsHash !== after.filingsHash) {
    const added = after.filingCount - before.filingCount;
    out.push({
      kind: "filings",
      summary: added > 0 ? `${added} new filing${added === 1 ? "" : "s"}` : "The filing history changed",
    });
  }
  return out;
}
