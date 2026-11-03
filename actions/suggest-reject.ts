import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { assertAgentText } from "../server/board/language.js";
import {
  addSuggestion,
  listBoard,
  logActivity,
  StoreError,
} from "../server/board/store.js";
import type { Suggestion } from "../server/board/types.js";
import {
  actorFor,
  callerFor,
  failFrom,
  requireOwner,
} from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  targetId: z.string().min(1).describe("The id of the item or link you think the person should look at again"),
  reason: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .describe("Factual and sourced: what the record says that does not fit. No judgement about people."),
});

export async function suggestRejectRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<Suggestion> {
  const ownerEmail = requireOwner(ctx);
  const actor = actorFor(ctx);
  const caller = callerFor(ctx);
  // Wording is only held to the rule when the agent wrote it.
  if (actor === "agent") assertAgentText(args.reason);

  try {
    const board = await listBoard(args.caseId, ownerEmail);
    const exists =
      board.nodes.some((n) => n.id === args.targetId) ||
      board.edges.some((e) => e.id === args.targetId);
    if (!exists) throw new StoreError("target_not_found");

    const suggestion = await addSuggestion(args.caseId, ownerEmail, args.targetId, args.reason);
    await logActivity({
      caseId: args.caseId,
      ownerEmail,
      actor,
      caller,
      kind: "suggest-reject",
      targetId: args.targetId,
      detail: args.reason,
    });
    return suggestion;
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Suggest that the person take another look at an item or link, with a factual reason. This changes nothing: the item keeps its status and only the person can reject it. Do not use words that accuse or characterise people.",
  schema,
  http: { method: "POST" },
  run: suggestRejectRun,
});
