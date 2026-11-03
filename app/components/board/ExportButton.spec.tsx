// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExportButtonView, slugFilename } from "./ExportButton";

afterEach(cleanup);

const BRIEF = {
  markdown: "# Quay Street shells\n\n## Findings\n\n- Company: ONE LTD [E1]\n\nBased on public records retrieved on the dates shown. Not a finding of wrongdoing.\n",
  citations: 1,
  unconfirmed: 3,
};

function setup(over: Partial<Parameters<typeof ExportButtonView>[0]> = {}) {
  const makeBrief = vi.fn(async () => BRIEF);
  const download = vi.fn();
  const utils = render(
    <ExportButtonView makeBrief={makeBrief} filename="quay-street-shells-brief.md" download={download} stamp="a" {...over} />,
  );
  return { makeBrief, download, ...utils };
}

describe("ExportButtonView", () => {
  it("makes the brief once, even on a fast double click, and shows what is in it", async () => {
    const { makeBrief } = setup();
    const button = screen.getByRole("button", { name: "Make brief" });
    act(() => {
      button.click();
      button.click();
    });
    await screen.findByText("1 source · 3 unconfirmed items kept apart");
    expect(makeBrief).toHaveBeenCalledTimes(1);
    // The person reads the same text that will be downloaded.
    expect(screen.getByLabelText("Brief").textContent).toBe(BRIEF.markdown);
  });

  it("downloads exactly the text shown, under the case's file name", async () => {
    const { download } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    await screen.findByRole("button", { name: "Download .md" });
    fireEvent.click(screen.getByRole("button", { name: "Download .md" }));
    expect(download).toHaveBeenCalledWith("quay-street-shells-brief.md", BRIEF.markdown);
  });

  it("offers nothing to download before a brief has been made", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Download .md" })).toBeNull();
    expect(screen.queryByLabelText("Brief")).toBeNull();
  });

  it("drops a brief that no longer matches the board, so a stale one is never downloaded as current", async () => {
    const { rerender, makeBrief, download } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    await screen.findByRole("button", { name: "Download .md" });

    rerender(<ExportButtonView makeBrief={makeBrief} filename="x.md" download={download} stamp="b" />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Download .md" })).toBeNull());
    expect(screen.queryByLabelText("Brief")).toBeNull();
  });

  it("does not show a brief that finished after the board had already changed", async () => {
    let finish: (b: typeof BRIEF) => void = () => {};
    const makeBrief = vi.fn(() => new Promise<typeof BRIEF>((r) => { finish = r; }));
    const download = vi.fn();
    const { rerender } = render(<ExportButtonView makeBrief={makeBrief} filename="x.md" download={download} stamp="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    // The person confirms a card while the brief is still being written.
    rerender(<ExportButtonView makeBrief={makeBrief} filename="x.md" download={download} stamp="b" />);
    await act(async () => {
      finish(BRIEF);
    });
    expect(screen.queryByRole("button", { name: "Download .md" })).toBeNull();
    expect(screen.queryByLabelText("Brief")).toBeNull();
  });

  it("says in plain words when the brief could not be made, and lets the person try again", async () => {
    const makeBrief = vi
      .fn()
      .mockRejectedValueOnce(new Error("Action export-brief failed: That case was not found."))
      .mockResolvedValueOnce(BRIEF);
    setup({ makeBrief });
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That case was not found.");
    expect(screen.queryByRole("button", { name: "Download .md" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    await screen.findByRole("button", { name: "Download .md" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses singular words for one of something, and says plainly when nothing is unconfirmed", async () => {
    setup({ makeBrief: vi.fn(async () => ({ ...BRIEF, unconfirmed: 1 })) });
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    await screen.findByText("1 source · 1 unconfirmed item kept apart");
    cleanup();

    setup({ makeBrief: vi.fn(async () => ({ ...BRIEF, citations: 2, unconfirmed: 0 })) });
    fireEvent.click(screen.getByRole("button", { name: "Make brief" }));
    await screen.findByText("2 sources · nothing unconfirmed");
  });
});

describe("slugFilename", () => {
  it("makes a plain file name from the case title", () => {
    expect(slugFilename("Quay Street shells")).toBe("quay-street-shells-brief.md");
    expect(slugFilename("  A/B: C & D?  ")).toBe("a-b-c-d-brief.md");
  });

  it("falls back to a neutral name when the title has nothing usable, and never gets long", () => {
    expect(slugFilename("???")).toBe("case-brief.md");
    expect(slugFilename("")).toBe("case-brief.md");
    expect(slugFilename("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
