import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { computeObservations } from "../server/board/observations.js";
import { getCase, listBoard } from "../server/board/store.js";
import type { Board, Observation } from "../server/board/types.js";
import { failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({ caseId: z.string().min(1) });

export async function getBoardRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<Board & { caseId: string; title: string; observations: Observation[] }> {
  const ownerEmail = requireOwner(ctx);
  try {
    const c = await getCase(args.caseId, ownerEmail);
    const board = await listBoard(args.caseId, ownerEmail);
    return { ...board, caseId: c.id, title: c.title, observations: computeObservations(board) };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Read a case board: its title, items and links with their status, who added them and their sources; coverage of each source; the activity log; open suggestions; pending changes; and pattern observations (companies sharing an address, officers on several companies) as counts and ids. Rejected and dead-end items are listed with their reasons; do not propose them again.",
  schema,
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  run: getBoardRun,
});
