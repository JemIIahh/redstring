import { describe, expect, it, vi } from "vitest";

import { CapError } from "../usage/caps.js";
import { guardAgentRun, isFreshUserTurn } from "./run-guard.js";

const turn = (over: Record<string, unknown> = {}) => ({
  ownerEmail: "alice@example.com" as string | null,
  message: "dig into this one",
  dispatchToBackground: false,
  ...over,
});

function deps() {
  return {
    assertWithinCaps: vi.fn(async () => {}),
    recordUsage: vi.fn(async () => {}),
  };
}

describe("isFreshUserTurn", () => {
  it("counts a message the person just sent", () => {
    expect(isFreshUserTurn(turn())).toBe(true);
    // The request that hands the turn to a background worker is still the person's turn.
    expect(isFreshUserTurn(turn({ dispatchToBackground: true }))).toBe(true);
  });

  it("does not count a continuation, a background worker's run, or an empty message", () => {
    expect(isFreshUserTurn(turn({ internalContinuation: true }))).toBe(false);
    expect(isFreshUserTurn(turn({ isBackgroundWorker: true }))).toBe(false);
    expect(isFreshUserTurn(turn({ message: "   " }))).toBe(false);
  });
});

describe("guardAgentRun", () => {
  it("checks the daily limit and then records one run for a fresh turn", async () => {
    const d = deps();
    await guardAgentRun(turn(), d);
    expect(d.assertWithinCaps).toHaveBeenCalledWith("alice@example.com", "agent-run");
    expect(d.recordUsage).toHaveBeenCalledWith("alice@example.com", "agent-run");
  });

  it("does not count continuations, so one question is one run however many steps it takes", async () => {
    const d = deps();
    await guardAgentRun(turn({ internalContinuation: true }), d);
    await guardAgentRun(turn({ isBackgroundWorker: true }), d);
    expect(d.assertWithinCaps).not.toHaveBeenCalled();
    expect(d.recordUsage).not.toHaveBeenCalled();
  });

  it("refuses the turn with a 429 and the limit message when the day's runs are spent, and records nothing", async () => {
    const d = deps();
    d.assertWithinCaps.mockRejectedValueOnce(new CapError("agent-run"));
    const err = await guardAgentRun(turn(), d).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 429 });
    expect(String(err.message)).toContain("Daily limit reached");
    expect(d.recordUsage).not.toHaveBeenCalled();
  });

  it("also refuses with a 429 when the kill switch is on", async () => {
    const d = deps();
    d.assertWithinCaps.mockRejectedValueOnce(new CapError("kill-switch"));
    await expect(guardAgentRun(turn(), d)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("lets any other failure through unchanged instead of dressing it up as a limit", async () => {
    const d = deps();
    const boom = new Error("database unavailable");
    d.assertWithinCaps.mockRejectedValueOnce(boom);
    await expect(guardAgentRun(turn(), d)).rejects.toBe(boom);
  });

  it("has nothing to count against when there is no signed-in owner", async () => {
    const d = deps();
    await guardAgentRun(turn({ ownerEmail: null }), d);
    expect(d.assertWithinCaps).not.toHaveBeenCalled();
  });
});
