import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import {
  expandNode,
  type ExpandPart,
  type ExpandResult,
} from "../server/board/expand.js";
import { logActivity } from "../server/board/store.js";
import { buildSources, type Sources } from "../server/sources/registry.js";
import {
  actorFor,
  callerFor,
  describeExpansion,
  failFrom,
  logRefusal,
  requireOwner,
} from "../server/actions-support.js";

const PARTS = ["officers", "controllers", "address", "filings", "leaks", "neighbours"] as const;

const schema = z.object({
  caseId: z.string().min(1),
  nodeId: z.string().min(1).describe("A company or person already on the board"),
  include: z
    .array(z.enum(PARTS))
    .optional()
    .describe(
      "Which records to read. UK default: officers, controllers, address. US default: filings, leaks. Filings, leaks and neighbours (companies at the same address) cost extra calls, so ask for them only when needed.",
    ),
});

export async function expandNodeRun(
  args: { caseId: string; nodeId: string; include?: ExpandPart[] | undefined },
  ctx?: ActionRunContext,
  deps: { sources?: Sources } = {},
): Promise<ExpandResult> {
  const ownerEmail = requireOwner(ctx);
  const actor = actorFor(ctx);
  const caller = callerFor(ctx);

  let out: ExpandResult;
  try {
    out = await expandNode(deps.sources ?? buildSources(ownerEmail), {
      caseId: args.caseId,
      ownerEmail,
      nodeId: args.nodeId,
      actor,
      caller,
      ...(args.include ? { include: args.include } : {}),
    });
  } catch (e) {
    await logRefusal({
      caseId: args.caseId,
      ownerEmail,
      actor,
      caller,
      kind: "expand-refused",
      targetId: args.nodeId,
      error: e,
    });
    return failFrom(e);
  }

  await logActivity({
    caseId: args.caseId,
    ownerEmail,
    actor,
    caller,
    kind: "expand",
    targetId: args.nodeId,
    detail: describeExpansion(out),
  });
  return out;
}

export default defineAction({
  description:
    "Read the public records for a company or person on the board and propose what they show: officers, controllers, registered address, and optionally filings, Offshore Leaks name matches and companies at the same address. Everything added is 'proposed' with its source; only the person can confirm or reject it. Items the person already rejected or marked a dead end are skipped and counted. The result lists any source that could not be read in full: say so to the person rather than implying the search was complete.",
  schema,
  http: { method: "POST" },
  run: expandNodeRun,
});
