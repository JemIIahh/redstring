import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { searchEntity } from "../server/board/expand.js";
import { buildSources, type Sources } from "../server/sources/registry.js";
import { failFrom, requireOwner } from "../server/actions-support.js";

const schema = z.object({
  query: z.string().trim().min(1).max(200).describe("A company name to look for"),
  jurisdiction: z
    .enum(["uk", "us"])
    .describe("uk searches Companies House; us searches SEC filers and GLEIF"),
});

export async function searchEntityRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
  deps: { sources?: Sources } = {},
) {
  const ownerEmail = requireOwner(ctx);
  try {
    return await searchEntity(deps.sources ?? buildSources(ownerEmail), args);
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Search public company registers by name. Returns candidate companies only; nothing is added to a board. A person chooses which one to start a case from. 'no matches' means every source was searched and found nothing; a note naming a source means that source could not be searched.",
  schema,
  http: { method: "GET" },
  mcpTool: true,
  run: searchEntityRun,
});
