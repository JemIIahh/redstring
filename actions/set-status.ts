import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { setStatus } from "../server/board/store.js";
import type { Status } from "../server/board/types.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  targetKind: z.enum(["node", "edge"]),
  targetId: z.string().min(1),
  to: z.enum(["proposed", "confirmed", "rejected", "dead-end"]),
  reason: z.string().trim().max(500).optional().describe("Required when rejecting or marking a dead end"),
});

export async function setStatusRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ targetId: string; status: Status }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  try {
    await setStatus({
      caseId: args.caseId,
      ownerEmail,
      targetKind: args.targetKind,
      targetId: args.targetId,
      to: args.to,
      ...(args.reason ? { reason: args.reason } : {}),
      actor: "person",
      caller: "frontend",
    });
  } catch (e) {
    return failFrom(e);
  }
  return { targetId: args.targetId, status: args.to };
}

export default defineAction({
  description: "Confirm, reject or mark an item or link as a dead end. Only the person does this.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: setStatusRun,
});
