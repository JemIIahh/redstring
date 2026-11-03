import { createError } from "h3";

import { assertWithinCaps, CapError, recordUsage } from "../usage/caps.js";

/** The parts of the framework's request details the guard reads. */
export interface AgentTurn {
  ownerEmail: string | null;
  message: string;
  internalContinuation?: boolean;
  isBackgroundWorker?: boolean;
  dispatchToBackground?: boolean;
}

/**
 * A message the person just sent. The framework calls `prepareRequest` again for every
 * continuation (an approval resuming, a background worker picking the turn up), and those
 * are the same question, so they are not counted.
 */
export function isFreshUserTurn(d: AgentTurn): boolean {
  return !d.internalContinuation && !d.isBackgroundWorker && d.message.trim() !== "";
}

interface Deps {
  assertWithinCaps: typeof assertWithinCaps;
  recordUsage: typeof recordUsage;
}

/**
 * Spend guard for the agent: one fresh question is one run against the person's daily
 * limit, and a spent limit (or the kill switch) refuses the turn before any model call.
 * The refusal is a 429 whose message is safe to show.
 */
export async function guardAgentRun(
  d: AgentTurn,
  deps: Deps = { assertWithinCaps, recordUsage },
): Promise<void> {
  if (!d.ownerEmail || !isFreshUserTurn(d)) return;
  try {
    await deps.assertWithinCaps(d.ownerEmail, "agent-run");
  } catch (e) {
    if (e instanceof CapError) {
      throw createError({ statusCode: 429, statusMessage: "Too Many Requests", message: e.message });
    }
    throw e;
  }
  await deps.recordUsage(d.ownerEmail, "agent-run");
}
