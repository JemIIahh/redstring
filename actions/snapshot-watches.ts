import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import {
  addChange,
  latestSnapshot,
  listWatches,
  logActivity,
  saveSnapshot,
} from "../server/board/store.js";
import { buildSources, type Sources } from "../server/sources/registry.js";
import { SourceError } from "../server/sources/types.js";
import { CapError } from "../server/usage/caps.js";
import { diffSnapshots, takeSnapshot } from "../server/watch/snapshot.js";
import { actorFor, callerFor, requireOwner } from "../server/actions-support.js";

const schema = z.object({});

export interface SnapshotWatchesResult {
  /** Watches this person has, checked or not. */
  watches: number;
  /** Watches looked at for the first time: the starting point later checks compare with. */
  baselines: number;
  /** Change rows written for the person to review. */
  changes: number;
  /** Watches checked again with nothing new. */
  unchanged: number;
  failed: Array<{ companyNumber: string; reason: string }>;
  /** Company numbers not looked at because the run stopped early. */
  notChecked: string[];
  /** Why the run stopped early (a spent limit), in words safe to show. */
  stoppedEarly?: string;
}

export async function snapshotWatchesRun(
  _args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
  deps: { sources?: Sources; now?: () => Date } = {},
): Promise<SnapshotWatchesResult> {
  const ownerEmail = requireOwner(ctx);
  const actor = actorFor(ctx);
  const caller = callerFor(ctx);

  const watches = await listWatches(ownerEmail);
  const out: SnapshotWatchesResult = {
    watches: watches.length,
    baselines: 0,
    changes: 0,
    unchanged: 0,
    failed: [],
    notChecked: [],
  };
  if (watches.length === 0) return out;
  const sources = deps.sources ?? buildSources(ownerEmail);

  for (const [i, w] of watches.entries()) {
    let snapshot;
    try {
      snapshot = await takeSnapshot(sources, w.companyNumber, deps.now ? { now: deps.now } : {});
    } catch (e) {
      // A spent limit applies to every watch after this one too: stop and say so.
      if (e instanceof CapError || (e instanceof SourceError && e.kind === "rate_limited")) {
        out.stoppedEarly = e.message;
        out.notChecked = watches.slice(i).map((x) => x.companyNumber);
        break;
      }
      // Anything else is about this company only. Nothing is stored for it, so
      // the next run compares with the last good snapshot.
      if (e instanceof SourceError) {
        out.failed.push({ companyNumber: w.companyNumber, reason: e.message });
        continue;
      }
      throw e;
    }

    const previous = await latestSnapshot(ownerEmail, w.id);
    const log = (kind: string, detail: string) =>
      logActivity({
        caseId: w.caseId,
        ownerEmail,
        actor,
        caller,
        kind,
        targetId: w.nodeId,
        detail,
      });

    if (!previous) {
      await saveSnapshot(ownerEmail, w.id, snapshot);
      await log("watch-baseline", `Started watching ${w.companyNumber}`);
      out.baselines += 1;
      continue;
    }

    const diffs = diffSnapshots(previous, snapshot);
    // Changes first, then the snapshot: if this stops in between, the next run
    // reports the change again (the person dismisses a duplicate) instead of
    // losing it.
    for (const d of diffs) {
      await addChange(ownerEmail, {
        caseId: w.caseId,
        watchId: w.id,
        kind: d.kind,
        summary: d.summary,
      });
    }
    await saveSnapshot(ownerEmail, w.id, snapshot);
    if (diffs.length > 0) {
      await log("watch-change", diffs.map((d) => d.summary).join("; "));
      out.changes += diffs.length;
    } else {
      out.unchanged += 1;
    }
  }
  return out;
}

export default defineAction({
  description:
    "Check every company the person is watching for changes since the last check: new filings, and changes to officers or people with significant control. Each change is added for the person to accept or dismiss; nothing on the board is altered. The first check of a company only records a starting point. If the result says it stopped early or could not read a company, say so rather than implying every company was checked.",
  schema,
  http: { method: "POST" },
  run: snapshotWatchesRun,
});
