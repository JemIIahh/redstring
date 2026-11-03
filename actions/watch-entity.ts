import { defineAction, fail, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import {
  addWatch,
  listBoard,
  listWatches,
  logActivity,
  StoreError,
} from "../server/board/store.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  nodeId: z.string().min(1).describe("A UK company on the board"),
});

export async function watchEntityRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ watchId: string }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);

  try {
    const board = await listBoard(args.caseId, ownerEmail);
    const node = board.nodes.find((n) => n.id === args.nodeId);
    if (!node) throw new StoreError("node_not_found");
    // Only Companies House is re-read for changes, and it is keyed by company number.
    if (node.type !== "company" || node.facts.jurisdiction !== "uk") {
      fail("Only a UK company can be watched, because changes are checked against Companies House.", {
        errorCode: "not_watchable",
        statusCode: 400,
      });
    }

    const already = (await listWatches(ownerEmail, args.caseId)).some((w) => w.nodeId === node.id);
    const watch = await addWatch(args.caseId, ownerEmail, node.id, node.key);
    if (!already) {
      await logActivity({
        caseId: args.caseId,
        ownerEmail,
        actor: "person",
        caller: "frontend",
        kind: "watch",
        targetId: node.id,
        detail: `Watching ${node.label} (${node.key})`,
      });
    }
    return { watchId: watch.id };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description: "Start watching a UK company on the board for changes in its officers, controllers and filings. Only the person does this.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: watchEntityRun,
});
