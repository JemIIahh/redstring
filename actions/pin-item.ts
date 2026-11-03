import { defineAction, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { logActivity, pinNode } from "../server/board/store.js";
import type { EvidenceInput } from "../server/board/types.js";
import { contentHash } from "../server/sources/hash.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const schema = z.object({
  caseId: z.string().min(1),
  type: z.enum(["company", "person", "address", "document"]),
  label: z.string().trim().min(1).max(200),
  sourceUrl: z.string().trim().min(1).max(2000).describe("Where the person found it. Must be an https link."),
  reference: z.string().trim().min(1).max(200).describe("Where in that source, for example a table row or page number"),
  source: z.enum(["occrp", "manual"]),
});

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function pinItemRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
): Promise<{ nodeId: string }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  const label = args.label.trim();
  const url = args.sourceUrl.trim();
  const reference = args.reference.trim();

  // Nothing was fetched here: the person is recording what they found, so the
  // time is when they pinned it and the hash covers exactly what they gave.
  const evidence: EvidenceInput = {
    source: args.source,
    url,
    recordId: reference,
    retrievedAt: new Date().toISOString(),
    contentHash: contentHash({ url, reference, label }),
  };

  try {
    const node = await pinNode({
      caseId: args.caseId,
      ownerEmail,
      type: args.type,
      // The row is part of the key: two people called John Smith in different rows are two cards.
      key: `${args.source}:${squash(label)}:${squash(reference)}`,
      label,
      facts: {},
      evidence: [evidence],
      actor: "person",
      status: "confirmed",
    });
    await logActivity({
      caseId: args.caseId,
      ownerEmail,
      actor: "person",
      caller: "frontend",
      kind: "pin-item",
      targetId: node.id,
      detail: label,
    });
    return { nodeId: node.id };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Pin something the person found themselves, such as a row in an OCCRP table, with a link to where they found it. Only the person does this.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: pinItemRun,
});
