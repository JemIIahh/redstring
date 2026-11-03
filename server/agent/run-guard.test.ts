import { describe, expect, it, vi } from "vitest";

import { CapError } from "../usage/caps.js";
import { classifyTurn, guardAgentRun } from "./run-guard.js";

const turn = (over: Record<string, unknown> = {}) => ({
  ownerEmail: "alice@example.com" as string | null,
  message: "dig into this one",
  dispatchToBackground: false,
  ...over,
});

function deps() {
  return {
    assertKillSwitchOff: vi.fn(async () => {}),
    assertWithinCaps: vi.fn(async () => {}),
    recordUsage: vi.fn(async () => {}),
  };
}

describe("classifyTurn", () => {
  it("calls a message the person sent a run, even one handed to a background worker or with no text", () => {
    expect(classifyTurn(turn())).toBe("run");
    expect(classifyTurn(turn({ dispatchToBackground: true }))).toBe("run");
    // No text is no reason to skip the count: that would be a way round the limit.
    expect(classifyTurn(turn({ message: "   " }))).toBe("run");
  });

  it("calls a request that says it is a continuation a continuation, and a background worker's own run a worker", () => {
    expect(classifyTurn(turn({ internalContinuation: true }))).toBe("continuation");
    expect(classifyTurn(turn({ isBackgroundWorker: true }))).toBe("worker");
    // The worker marker is set by the server, so it wins over the browser's flag.
    expect(classifyTurn(turn({ isBackgroundWorker: true, internalContinuation: true }))).toBe("worker");
  });
});

describe("guardAgentRun", () => {
  it("checks the daily run limit and then records one run for a message the person sent", async () => {
    const d = deps();
    await guardAgentRun(turn(), d);
    expect(d.assertWithinCaps).toHaveBeenCalledWith("alice@example.com", "agent-run");
    expect(d.recordUsage).toHaveBeenCalledWith("alice@example.com", "agent-run");
  });

  it("does not take the browser's word that a request is a continuation: it is counted, against its own limit", async () => {
    const d = deps();
    await guardAgentRun(turn({ internalContinuation: true }), d);
    expect(d.assertWithinCaps).toHaveBeenCalledTimes(1);
    expect(d.assertWithinCaps).toHaveBeenCalledWith("alice@example.com", "agent-continuation");
    expect(d.recordUsage).toHaveBeenCalledWith("alice@example.com", "agent-continuation");
    expect(d.recordUsage).not.toHaveBeenCalledWith("alice@example.com", "agent-run");
  });

  it("refuses a continuation with a 429 once that limit is spent, so a forged flag is not a free pass", async () => {
    const d = deps();
    d.assertWithinCaps.mockRejectedValueOnce(new CapError("agent-continuation"));
    await expect(guardAgentRun(turn({ internalContinuation: true }), d)).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(d.recordUsage).not.toHaveBeenCalled();
  });

  it("lets the server's own background worker run without counting it, but never past the kill switch", async () => {
    const d = deps();
    await guardAgentRun(turn({ isBackgroundWorker: true }), d);
    expect(d.assertKillSwitchOff).toHaveBeenCalledTimes(1);
    expect(d.assertWithinCaps).not.toHaveBeenCalled();
    expect(d.recordUsage).not.toHaveBeenCalled();

    d.assertKillSwitchOff.mockRejectedValueOnce(new CapError("kill-switch"));
    await expect(guardAgentRun(turn({ isBackgroundWorker: true }), d)).rejects.toMatchObject({
      statusCode: 429,
    });
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

  it("refuses a request with no signed-in owner: there is no one to count it against", async () => {
    const d = deps();
    await expect(guardAgentRun(turn({ ownerEmail: null }), d)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(d.recordUsage).not.toHaveBeenCalled();
  });
});
