import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { AGENT_LIMITS, agentBoardView, type AgentBoard, type FullBoard } from "../server/board/agent-view.js";
import { computeObservations } from "../server/board/observations.js";
import { getCase, listBoard } from "../server/board/store.js";
import { actorFor, failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({ caseId: z.string().min(1) });

/**
 * The person's own screen gets the full board with every source row. An agent (the app's own,
 * or an outside one over MCP) gets a lean version: statuses, reasons and where each item came
 * from, without addresses, hashes or excerpts, and with the latest activity only.
 */
export async function getBoardRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<FullBoard | AgentBoard> {
  const ownerEmail = requireOwner(ctx);
  try {
    const c = await getCase(args.caseId, ownerEmail);
    const board = await listBoard(args.caseId, ownerEmail);
    const full: FullBoard = {
      ...board,
      caseId: c.id,
      title: c.title,
      observations: computeObservations(board),
    };
    return actorFor(ctx) === "person" ? full : agentBoardView(full);
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Read a case board: its title, items and links with their status, who added them and which records they came from; coverage of each source; the latest activity; open suggestions; pending changes; and pattern observations (companies sharing an address, officers on several companies) as counts and ids. Rejected and dead-end items are listed with their reasons; do not propose them again. If the result has an `omitted` field, say so: the board is bigger than what is listed.",
  schema,
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  maxResultChars: AGENT_LIMITS.resultChars,
  run: getBoardRun,
});
