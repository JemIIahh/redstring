import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { checkLeaks, type ExpandResult } from "../server/board/expand.js";
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

const schema = z.object({
  caseId: z.string().min(1),
  nodeId: z.string().min(1).describe("Any item on the board: a company, a person or an address"),
});

export async function checkLeaksRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
  deps: { sources?: Sources } = {},
): Promise<ExpandResult> {
  const ownerEmail = requireOwner(ctx);
  const actor = actorFor(ctx);
  const caller = callerFor(ctx);

  let out: ExpandResult;
  try {
    out = await checkLeaks(deps.sources ?? buildSources(ownerEmail), {
      caseId: args.caseId,
      ownerEmail,
      nodeId: args.nodeId,
      actor,
      caller,
    });
  } catch (e) {
    await logRefusal({
      caseId: args.caseId,
      ownerEmail,
      actor,
      caller,
      kind: "check-leaks-refused",
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
    kind: "check-leaks",
    targetId: args.nodeId,
    detail: describeExpansion(out),
  });
  return out;
}

export default defineAction({
  description:
    "Look an item's name up in the ICIJ Offshore Leaks database. Matches are by name only, so every result is added as a 'proposed' candidate with its score; none is a confirmed match. No candidates is recorded as 'no match', not as an error.",
  schema,
  http: { method: "POST" },
  run: checkLeaksRun,
});
