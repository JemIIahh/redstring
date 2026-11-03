// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canWatch, WatchButtonView } from "./WatchButton";

afterEach(cleanup);

describe("canWatch", () => {
  it("is true only for a UK company, because changes are read from Companies House", () => {
    expect(canWatch({ type: "company", facts: { jurisdiction: "uk" } })).toBe(true);
    expect(canWatch({ type: "company", facts: { jurisdiction: "us" } })).toBe(false);
    expect(canWatch({ type: "company", facts: {} })).toBe(false);
    expect(canWatch({ type: "person", facts: { jurisdiction: "uk" } })).toBe(false);
  });
});

describe("WatchButtonView", () => {
  it("offers to watch, asks once, and does not claim anything about changes yet", async () => {
    const onWatch = vi.fn(async () => ({}));
    render(<WatchButtonView watched={false} onWatch={onWatch} />);
    const button = screen.getByRole("button", { name: "Watch for changes" });
    // A fast double click lands twice before the button redraws as disabled.
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(onWatch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/no changes/i)).toBeNull();
  });

  it("says it is watching, with no button, once watched", () => {
    render(<WatchButtonView watched onWatch={vi.fn()} />);
    expect(screen.getByText("Watching for changes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Watch for changes" })).toBeNull();
  });

  it("shows a failure in plain words and lets the person try again", async () => {
    const onWatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Action watch-entity failed: Only a UK company can be watched."))
      .mockResolvedValueOnce({});
    render(<WatchButtonView watched={false} onWatch={onWatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Watch for changes" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Only a UK company can be watched.");
    fireEvent.click(screen.getByRole("button", { name: "Watch for changes" }));
    await waitFor(() => expect(onWatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
