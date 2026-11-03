import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { logActivity, reviewChange } from "../server/board/store.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  changeId: z.string().min(1),
  decision: z.enum(["accept", "dismiss"]),
});

export async function reviewChangeRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ changeId: string; status: "accepted" | "dismissed" }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  const status = args.decision === "accept" ? "accepted" : "dismissed";
  try {
    await reviewChange(args.caseId, ownerEmail, args.changeId, status);
    await logActivity({
      caseId: args.caseId,
      ownerEmail,
      actor: "person",
      caller: "frontend",
      kind: "review-change",
      targetId: args.changeId,
      detail: status,
    });
  } catch (e) {
    return failFrom(e);
  }
  return { changeId: args.changeId, status };
}

export default defineAction({
  description: "Accept or dismiss a change found on a watched company. Only the person does this.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: reviewChangeRun,
});
