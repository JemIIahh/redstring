import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { logActivity, resolveSuggestion } from "../server/board/store.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  suggestionId: z.string().min(1),
  decision: z.enum(["accept", "dismiss"]),
});

// Accepting a suggestion only marks it as read and agreed with. The item keeps
// its status; the person rejects it separately with set-status if they choose.
export async function reviewSuggestionRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ suggestionId: string; status: "accepted" | "dismissed" }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  const status = args.decision === "accept" ? "accepted" : "dismissed";
  try {
    await resolveSuggestion(args.caseId, ownerEmail, args.suggestionId, status);
    await logActivity({
      caseId: args.caseId,
      ownerEmail,
      actor: "person",
      caller: "frontend",
      kind: "review-suggestion",
      targetId: args.suggestionId,
      detail: status,
    });
  } catch (e) {
    return failFrom(e);
  }
  return { suggestionId: args.suggestionId, status };
}

export default defineAction({
  description: "Accept or dismiss one of the agent's suggestions to take another look at an item. This does not change the item's status.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: reviewSuggestionRun,
});
