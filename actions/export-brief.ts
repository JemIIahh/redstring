import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { buildBrief } from "../server/board/brief.js";
import { getCase, listBoard, logActivity } from "../server/board/store.js";
import { actorFor, callerFor, failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({ caseId: z.string().min(1).describe("The case to write up, from list-cases or view-screen") });

export interface ExportBriefResult {
  /** The brief, as markdown. */
  markdown: string;
  /** How many distinct source records it cites. */
  citations: number;
  /** How many items are only proposed and are kept under "Unconfirmed". */
  unconfirmed: number;
}

export async function exportBriefRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
  deps: { now?: () => Date } = {},
): Promise<ExportBriefResult> {
  const ownerEmail = requireOwner(ctx);
  try {
    const c = await getCase(args.caseId, ownerEmail);
    const board = await listBoard(args.caseId, ownerEmail);
    const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
    const brief = buildBrief(board, { title: c.title, generatedAt });
    // Taking a brief out of the app is worth a line on the case, whoever asked for it.
    await logActivity({
      caseId: args.caseId,
      ownerEmail,
      actor: actorFor(ctx),
      caller: callerFor(ctx),
      kind: "export-brief",
      detail: `${brief.citations} ${brief.citations === 1 ? "source" : "sources"}, ${brief.unconfirmed} unconfirmed`,
    });
    return brief;
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Write the case up as a sourced brief in markdown: what the person confirmed, each line pointing at the public record it came from; what is still only proposed, kept apart; what they ruled out and why; and what was and was not searched. It contains no text the agent wrote and no birth dates. Taking a brief out of the app needs the person's approval, so this pauses until they give it. Hand the person the markdown as it is; do not add to it.",
  schema,
  http: { method: "POST" },
  needsApproval: true,
  maxResultChars: 200_000,
  run: exportBriefRun,
});
