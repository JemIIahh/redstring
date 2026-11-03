import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { latestSnapshot, listChanges, listWatches } from "../server/board/store.js";
import type { Change } from "../server/board/types.js";
import { failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1).describe("The case to read, from list-cases or view-screen"),
});

/** A change, with the company it is about: "1 new filing" alone does not say whose. */
export type PendingChange = Change & { nodeId?: string; companyNumber?: string };

export interface ListChangesResult {
  /** Changes found on watched companies that the person has not yet accepted or dismissed, oldest first. */
  changes: PendingChange[];
  /** How many companies in this case are being watched. */
  watching: number;
  /** The cards of those companies, so a screen can show which ones are watched. */
  watchedNodeIds: string[];
  /**
   * The day every company that has been read was last read on: the oldest of their latest checks,
   * or null if none has been read yet. A person told "no changes since <date>" must be able to
   * trust that each company really was looked at on or after that date.
   */
  lastCheckedAt: string | null;
  /** How many watched companies have never been read. While this is above 0, nothing may say "no changes". */
  unchecked: number;
}

export async function listChangesRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<ListChangesResult> {
  const ownerEmail = requireOwner(ctx);
  try {
    // Reading the changes also proves the case is this person's.
    const all = await listChanges(args.caseId, ownerEmail);
    const watches = await listWatches(ownerEmail, args.caseId);
    const snapshots = await Promise.all(watches.map((w) => latestSnapshot(ownerEmail, w.id)));
    const checked = snapshots.flatMap((s) => (s ? [s.takenAt] : [])).sort();
    const unchecked = snapshots.filter((s) => !s).length;
    const watchById = new Map(watches.map((w) => [w.id, w]));
    return {
      changes: all
        .filter((c) => c.status === "pending")
        .map((c): PendingChange => {
          const w = watchById.get(c.watchId);
          return w ? { ...c, nodeId: w.nodeId, companyNumber: w.companyNumber } : c;
        }),
      watching: watches.length,
      watchedNodeIds: watches.map((w) => w.nodeId),
      lastCheckedAt: checked.length > 0 ? checked[0]! : null,
      unchecked,
    };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Read what is waiting for the person on the companies they watch: changes found by snapshot-watches (new filings, officer or controller changes) that they have not yet accepted or dismissed, each with the company it is about, how many companies are watched, how many of those have never been read, and the date every company that was read had been read by. An empty list with a date and unchecked 0 means every watched company was read on or after that date and nothing differed; with no date, or unchecked above 0, something has not been read, so do not say there are no changes. This only reads.",
  schema,
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  run: listChangesRun,
});
