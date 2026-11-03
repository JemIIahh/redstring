import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { listCases } from "../server/board/store.js";
import type { CaseSummary } from "../server/board/types.js";
import { failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({});

export async function listCasesRun(
  _args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<CaseSummary[]> {
  const ownerEmail = requireOwner(ctx);
  try {
    return await listCases(ownerEmail);
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "List the person's cases, newest first: id, title, how many cards each has and how many proposed items still wait for the person. Use the id with get-board to read one.",
  schema,
  http: { method: "GET" },
  readOnly: true,
  mcpTool: true,
  run: listCasesRun,
});
