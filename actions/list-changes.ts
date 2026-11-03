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
   * When any watched company in this case was last read, or null if none has been read yet.
   * A person told "no changes since <date>" must be able to trust that a check really happened.
   */
  lastCheckedAt: string | null;
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
      lastCheckedAt: checked.length > 0 ? checked[checked.length - 1]! : null,
    };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Read what is waiting for the person on the companies they watch: changes found by snapshot-watches (new filings, officer or controller changes) that they have not yet accepted or dismissed, each with the company it is about, how many companies are watched, and when any of them was last read. An empty list with a date means the companies were read on that date and nothing differed; with no date nothing has been read yet, so do not say there are no changes. This only reads.",
  schema,
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  run: listChangesRun,
});
