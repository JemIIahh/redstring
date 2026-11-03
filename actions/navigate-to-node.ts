import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

import { listBoard, StoreError } from "../server/board/store.js";
import { failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  nodeId: z.string().min(1),
});

export async function navigateToNodeRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<string> {
  const ownerEmail = requireOwner(ctx);
  let label: string;
  try {
    const board = await listBoard(args.caseId, ownerEmail);
    const node = board.nodes.find((n) => n.id === args.nodeId);
    if (!node) throw new StoreError("node_not_found");
    label = node.label;
  } catch (e) {
    return failFrom(e);
  }
  await writeAppStateForCurrentTab("navigate", {
    view: "case",
    caseId: args.caseId,
    nodeId: args.nodeId,
    _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  return `Showing ${label} on the board`;
}

export default defineAction({
  description:
    "Move the person's screen to an item on a case board and select it, so they can see what you are talking about.",
  schema,
  http: false,
  run: navigateToNodeRun,
});
