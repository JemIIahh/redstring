import { createError } from "h3";

import { assertKillSwitchOff, CapError, takeUsage } from "../usage/caps.js";

/** The parts of the framework's request details the guard reads. */
export interface AgentTurn {
  ownerEmail: string | null;
  message: string;
  /** Sent by the browser; the framework itself calls this marker client-controlled. */
  internalContinuation?: boolean;
  /** Set by the server when it re-enters itself to run a turn in the background; a browser cannot set it. */
  isBackgroundWorker?: boolean;
  dispatchToBackground?: boolean;
}

export type TurnKind = "run" | "continuation" | "worker";

/**
 * How a request counts. Only the server's own background worker is exempt, because only the
 * server can set that marker. A request that merely says it continues an earlier one is
 * counted too, against a looser limit: a limit that skipped it would be skipped by anyone
 * who set the flag. An empty message is counted too, for the same reason.
 */
export function classifyTurn(d: AgentTurn): TurnKind {
  if (d.isBackgroundWorker) return "worker";
  if (d.internalContinuation) return "continuation";
  return "run";
}

interface Deps {
  assertKillSwitchOff: typeof assertKillSwitchOff;
  takeUsage: typeof takeUsage;
}

const tooMany = (e: CapError) =>
  createError({ statusCode: 429, statusMessage: "Too Many Requests", message: e.message });

/**
 * Spend guard for the agent, run before any model call. A message is one run against the
 * person's daily limit; a continuation is counted against its own looser limit; the kill
 * switch stops everything, including a worker already under way. A spent limit refuses the
 * turn with a 429 whose message is safe to show.
 */
export async function guardAgentRun(
  d: AgentTurn,
  deps: Deps = { assertKillSwitchOff, takeUsage },
): Promise<void> {
  if (!d.ownerEmail) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "Sign in to use the agent.",
    });
  }
  const kind = classifyTurn(d);
  try {
    if (kind === "worker") {
      await deps.assertKillSwitchOff();
      return;
    }
    const cap = kind === "run" ? "agent-run" : "agent-continuation";
    // Check and count in one step: a burst of parallel requests cannot all see room under the limit.
    await deps.takeUsage(d.ownerEmail, cap);
  } catch (e) {
    if (e instanceof CapError) throw tooMany(e);
    throw e;
  }
}
