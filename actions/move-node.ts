import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { moveNode } from "../server/board/store.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  nodeId: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
});

export async function moveNodeRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ nodeId: string; x: number; y: number }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  try {
    await moveNode(args.caseId, ownerEmail, args.nodeId, args.x, args.y);
  } catch (e) {
    return failFrom(e);
  }
  return { nodeId: args.nodeId, x: args.x, y: args.y };
}

// A drag is layout, not a judgement, so it leaves no activity row.
export default defineAction({
  description: "Save where the person dragged an item on the board.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: moveNodeRun,
});
