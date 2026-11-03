// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleBoard } from "../../fixtures/laundromat-board";
import {
  describeRecheck,
  formatDay,
  queueChanges,
  queueProposals,
  queueSuggestions,
  reviewCount,
  ReviewQueueView,
  type QueueChange,
  type QueueProposal,
  type QueueSuggestion,
} from "./ReviewQueue";

afterEach(cleanup);

const change = (over: Partial<QueueChange> = {}): QueueChange => ({
  id: "ch1",
  kind: "filings",
  summary: "1 new filing",
  companyLabel: "QUAY STREET LAUNDRY LTD",
  createdAt: "2026-11-04T10:00:00.000Z",
  ...over,
});

const proposal = (over: Partial<QueueProposal> = {}): QueueProposal => ({
  id: "n9",
  kind: "node",
  title: "ANNE EXAMPLE",
  ...over,
});

const suggestion = (over: Partial<QueueSuggestion> = {}): QueueSuggestion => ({
  id: "s1",
  targetId: "n4",
  targetTitle: "ANNE EXAMPLE",
  reason: "Birth month and year differ from the officer on the other card.",
  ...over,
});

function setup(over: Partial<Parameters<typeof ReviewQueueView>[0]> = {}) {
  const handlers = {
    onConfirm: vi.fn(async () => ({})),
    onOpen: vi.fn(),
    onReviewChange: vi.fn(async () => ({})),
    onReviewSuggestion: vi.fn(async () => ({})),
  };
  render(
    <ReviewQueueView
      proposals={[]}
      suggestions={[]}
      changes={[]}
      watching={1}
      lastCheckedAt="2026-11-05T10:00:00.000Z"
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe("ReviewQueueView", () => {
  it('with no differences it shows "no changes since <date>" and lists nothing to answer', () => {
    setup();
    expect(screen.getByText("No changes since 5 Nov 2026")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("does not say there are no changes when nothing has been read yet", () => {
    setup({ lastCheckedAt: null });
    expect(screen.queryByText(/no changes/i)).toBeNull();
    expect(screen.getByText("Not checked yet")).toBeTruthy();
  });

  it("says plainly when no company is watched, instead of implying all is quiet", () => {
    setup({ watching: 0, lastCheckedAt: null });
    expect(screen.queryByText(/no changes/i)).toBeNull();
    expect(screen.getByText(/not watching any company/i)).toBeTruthy();
  });

  it("lists a change with its company and sends accept or dismiss for that change only", async () => {
    const h = setup({ changes: [change(), change({ id: "ch2", summary: "Officers changed", kind: "officers" })] });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("1 new filing")).toBeTruthy();
    expect(within(rows[0]!).getByText(/QUAY STREET LAUNDRY LTD/)).toBeTruthy();

    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(h.onReviewChange).toHaveBeenCalledWith("ch1", "accept"));
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(h.onReviewChange).toHaveBeenCalledWith("ch2", "dismiss"));
    expect(h.onReviewChange).toHaveBeenCalledTimes(2);
    // A change is not a verdict: nothing here changes a card.
    expect(h.onConfirm).not.toHaveBeenCalled();
  });

  it("does not show 'no changes' while changes are waiting", () => {
    setup({ changes: [change()] });
    expect(screen.queryByText(/no changes/i)).toBeNull();
  });

  it("lists the agent's proposed items; Confirm decides through the handler and Open only looks", async () => {
    const h = setup({ proposals: [proposal(), proposal({ id: "e3", kind: "edge", title: "A · director of · B" })] });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("ANNE EXAMPLE")).toBeTruthy();

    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Open" }));
    expect(h.onOpen).toHaveBeenCalledWith("n9");
    expect(h.onConfirm).not.toHaveBeenCalled();

    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(h.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: "e3", kind: "edge" })));
  });

  it("shows the agent's reason on a suggestion, and answering it never rejects the item", async () => {
    const h = setup({ suggestions: [suggestion()] });
    const row = screen.getByRole("listitem");
    expect(within(row).getByText(/Birth month and year differ/)).toBeTruthy();
    expect(within(row).getByText(/ANNE EXAMPLE/)).toBeTruthy();
    // The only buttons answer the suggestion or open the item; there is no Reject here.
    expect(within(row).queryByRole("button", { name: /reject/i })).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(h.onReviewSuggestion).toHaveBeenCalledWith("s1", "accept"));
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    expect(h.onOpen).toHaveBeenCalledWith("n4");
    expect(h.onConfirm).not.toHaveBeenCalled();
  });

  it("shows a failed answer in plain words on that row and lets the person try again", async () => {
    const onReviewChange = vi
      .fn()
      .mockRejectedValueOnce(new Error("Action review-change failed: That item changed while this was happening. Look at it again."))
      .mockResolvedValueOnce({});
    setup({ changes: [change()], onReviewChange });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That item changed while this was happening. Look at it again.");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(onReviewChange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does not answer the same change twice on a double click", async () => {
    let release: () => void = () => {};
    const onReviewChange = vi.fn(() => new Promise<unknown>((r) => { release = () => r({}); }));
    setup({ changes: [change()], onReviewChange });
    const accept = screen.getByRole("button", { name: "Accept" });
    // Both clicks land before React redraws the button as disabled, as a fast double click can.
    act(() => {
      accept.click();
      accept.click();
    });
    expect(onReviewChange).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("Re-check now", () => {
  const result = (over = {}) => ({
    watches: 2,
    baselines: 0,
    changes: 0,
    unchanged: 2,
    failed: [],
    notChecked: [],
    ...over,
  });

  it("calls the re-check once and reports what it found, not what the person hoped for", async () => {
    const onRecheck = vi.fn(async () => result({ unchanged: 1, changes: 1 }));
    setup({ onRecheck });
    const button = screen.getByRole("button", { name: "Re-check now" });
    act(() => {
      button.click();
      button.click();
    });
    await screen.findByText(/1 new change to review/);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("says when it could not read a company or stopped early, instead of 'all clear'", async () => {
    const onRecheck = vi.fn(async () =>
      result({
        unchanged: 0,
        failed: [{ companyNumber: "OC000001", reason: "Companies House did not answer in time." }],
        notChecked: ["OC000002"],
        stoppedEarly: "The daily Companies House limit is used up.",
      }),
    );
    setup({ onRecheck });
    fireEvent.click(screen.getByRole("button", { name: "Re-check now" }));
    await screen.findByText(/Could not read OC000001: Companies House did not answer in time\./);
    expect(screen.getByText(/Stopped early: The daily Companies House limit is used up\./)).toBeTruthy();
    expect(screen.queryByText(/nothing new/i)).toBeNull();
  });

  it("shows a failed re-check in plain words", async () => {
    const onRecheck = vi.fn(async () => {
      throw new Error("Action snapshot-watches failed: Sign in to use this.");
    });
    setup({ onRecheck });
    fireEvent.click(screen.getByRole("button", { name: "Re-check now" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Sign in to use this.");
  });

  it("is not offered when no company is watched", () => {
    setup({ watching: 0, lastCheckedAt: null, onRecheck: vi.fn() });
    expect(screen.queryByRole("button", { name: "Re-check now" })).toBeNull();
  });
});

describe("describeRecheck", () => {
  const base = { watches: 2, baselines: 0, changes: 0, unchanged: 2, failed: [], notChecked: [] };

  it("says what was checked and what was found", () => {
    expect(describeRecheck({ ...base, unchanged: 2 })).toEqual(["Checked 2 of 2 companies: 2 with nothing new."]);
    expect(describeRecheck({ ...base, changes: 3, unchanged: 1 })).toEqual([
      "Checked 2 of 2 companies: 3 new changes to review; 1 with nothing new.",
    ]);
    expect(describeRecheck({ ...base, watches: 1, baselines: 1, unchanged: 0 })).toEqual([
      "Checked 1 of 1 company: 1 read for the first time, the starting point for later checks.",
    ]);
  });

  it("names every company it could not read and says where it stopped", () => {
    expect(
      describeRecheck({
        watches: 3,
        baselines: 0,
        changes: 0,
        unchanged: 1,
        failed: [{ companyNumber: "OC1", reason: "Timed out." }],
        notChecked: ["OC3"],
        stoppedEarly: "Limit reached.",
      }),
    ).toEqual([
      "Checked 1 of 3 companies: 1 with nothing new.",
      "Could not read OC1: Timed out.",
      "Stopped early: Limit reached. Not checked: OC3.",
    ]);
  });

  it("reports nothing to check when no company is watched", () => {
    expect(describeRecheck({ ...base, watches: 0, unchanged: 0 })).toEqual(["No company is being watched."]);
  });
});

describe("formatDay", () => {
  it("writes a date the way the rest of the page does, in UTC so it does not shift by timezone", () => {
    expect(formatDay("2026-11-05T23:30:00.000Z")).toBe("5 Nov 2026");
    expect(formatDay("not a date")).toBe("not a date");
  });
});

describe("what waits for the person", () => {
  it("the count on the toolbar is exactly the number of rows the queue lists", () => {
    const rows = queueProposals(sampleBoard).length + queueSuggestions(sampleBoard).length + queueChanges(sampleBoard).length;
    expect(rows).toBeGreaterThan(0);
    expect(reviewCount(sampleBoard)).toBe(rows);
  });

  it("lists a pending change and drops it once it is answered, and the count follows", () => {
    expect(queueChanges(sampleBoard).map((c) => c.id)).toEqual(["ch1"]);
    const answered = {
      ...sampleBoard,
      changes: sampleBoard.changes.map((c) => ({ ...c, status: "dismissed" as const })),
    };
    expect(queueChanges(answered)).toEqual([]);
    expect(reviewCount(answered)).toBe(reviewCount(sampleBoard) - 1);
  });

  it("names the company a change is about when it is known, and says so plainly when it is not", () => {
    const company = sampleBoard.nodes.find((n) => n.type === "company")!;
    const known = queueChanges(sampleBoard, { ch1: { nodeId: company.id, companyNumber: "OC1" } });
    expect(known[0]!.companyLabel).toBe(company.label);
    const byNumber = queueChanges(sampleBoard, { ch1: { companyNumber: "OC1" } });
    expect(byNumber[0]!.companyLabel).toBe("OC1");
    expect(queueChanges(sampleBoard)[0]!.companyLabel).toBe("A watched company");
  });
});
