import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { addAnnotation } from "../server/board/store.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  targetId: z.string().min(1).describe("The id of the item or link the note is about"),
  text: z.string().trim().min(1).max(1000),
});

export async function annotateRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ targetId: string }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  try {
    await addAnnotation({
      caseId: args.caseId,
      ownerEmail,
      targetId: args.targetId,
      text: args.text,
      actor: "person",
      caller: "frontend",
    });
  } catch (e) {
    return failFrom(e);
  }
  return { targetId: args.targetId };
}

export default defineAction({
  description: "Add the person's own note to an item or link. It is kept in the activity log.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: annotateRun,
});
