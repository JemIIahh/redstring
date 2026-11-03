import { fail, type ActionRunContext } from "@agent-native/core/action";

import type { ExpandResult } from "./board/expand.js";
import { ProvenanceError } from "./board/provenance.js";
import { logActivity, StoreError } from "./board/store.js";
import type { Actor } from "./board/types.js";
import { SourceError } from "./sources/types.js";
import { CapError } from "./usage/caps.js";

/** The signed-in person the call is for. Every board query is scoped by this. */
export function requireOwner(ctx?: ActionRunContext): string {
  const email = ctx?.userEmail?.trim();
  if (!email) {
    fail("Sign in to use this.", { errorCode: "not_signed_in", statusCode: 401 });
  }
  return email;
}

/** A call from the app's own screen is the person's; anything else is the agent's. */
export const actorFor = (ctx?: ActionRunContext): Actor =>
  ctx?.caller === "frontend" ? "person" : "agent";

export const callerFor = (ctx?: ActionRunContext): string => ctx?.caller ?? "tool";

/**
 * Person-only actions: confirming, rejecting, pinning by hand, notes, moves,
 * reviews and watches are the person's own judgement or spend their quota.
 * The framework already refuses non-UI callers of a `uiOnly` action; this is
 * the same rule at the handler, so it holds however the handler is reached.
 */
export function requirePerson(ctx?: ActionRunContext): void {
  if (ctx?.caller !== "frontend") {
    throw new ProvenanceError("agent_not_allowed", "only the person can do this");
  }
}

const STORE_FAILURES: Record<StoreError["code"], [message: string, status: number]> = {
  case_not_found: ["That case was not found.", 404],
  node_not_found: ["That item was not found in this case.", 404],
  target_not_found: ["That item was not found in this case.", 404],
  status_conflict: ["That item changed while this was happening. Look at it again.", 409],
};

/**
 * Turns the errors a caller can fix or wait out into plain failures with a
 * status and a code. Rule violations (a missing source, a banned word, a
 * node that cannot be expanded) are thrown unchanged: they already say what
 * was wrong, and the agent should see them as they are.
 */
export function failFrom(e: unknown): never {
  if (e instanceof CapError) {
    fail(e.message, { errorCode: "limit_reached", statusCode: 429 });
  }
  if (e instanceof SourceError) {
    fail(e.message, {
      errorCode: `source_${e.kind}`,
      statusCode: e.kind === "not_found" ? 404 : 502,
    });
  }
  if (e instanceof StoreError) {
    const [message, statusCode] = STORE_FAILURES[e.code];
    fail(message, { errorCode: e.code, statusCode });
  }
  throw e;
}

/** A refused write leaves a trace in the activity log; the original error is still the one reported. */
export async function logRefusal(i: {
  caseId: string;
  ownerEmail: string;
  actor: Actor;
  caller: string;
  kind: string;
  targetId?: string;
  error: unknown;
}): Promise<void> {
  if (!(i.error instanceof ProvenanceError)) return;
  try {
    await logActivity({
      caseId: i.caseId,
      ownerEmail: i.ownerEmail,
      actor: i.actor,
      caller: i.caller,
      kind: i.kind,
      ...(i.targetId ? { targetId: i.targetId } : {}),
      detail: i.error.message,
    });
  } catch {
    // The case may not exist or belong to this person; there is nothing to log it on.
  }
}

/** One plain line for the activity log. */
export function describeExpansion(r: ExpandResult): string {
  const parts = [
    `${r.pinnedNodes} item${r.pinnedNodes === 1 ? "" : "s"} and ${r.pinnedEdges} link${r.pinnedEdges === 1 ? "" : "s"} proposed`,
  ];
  if (r.skippedDeadEnds > 0) {
    parts.push(`${r.skippedDeadEnds} rejected or dead-end left alone`);
  }
  if (r.incomplete.length > 0) {
    parts.push(`not fully read: ${r.incomplete.join(", ")}`);
  }
  return parts.join("; ");
}
