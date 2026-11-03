// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityHit } from "../../../server/board/expand";
import { NewCase } from "./NewCase";

afterEach(cleanup);

const ukHit = (key: string, name: string): EntityHit => ({
  jurisdiction: "uk",
  source: "companies-house",
  key,
  name,
  status: "active",
  address: "1 Quay Street, Leeds",
});

function setup(hits: EntityHit[], note?: string) {
  const search = vi.fn(async () => ({ hits, ...(note ? { note } : {}) }));
  const create = vi.fn(async () => ({ caseId: "case-123" }));
  const onCreated = vi.fn();
  render(<NewCase search={search} create={create} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "quay" } });
  fireEvent.click(screen.getByRole("button", { name: "Search registers" }));
  return { search, create, onCreated };
}

describe("NewCase", () => {
  it("shows a pick list for several hits and does not create until one is chosen", async () => {
    const { search, create, onCreated } = setup([
      ukHit("00000001", "Quay Street Laundry Ltd"),
      ukHit("00000002", "Quay Street Cleaners Ltd"),
    ]);

    // Both hits are listed; nothing is picked for the person.
    await screen.findByText("Quay Street Laundry Ltd");
    expect(screen.getByText("Quay Street Cleaners Ltd")).toBeTruthy();
    expect(search).toHaveBeenCalledWith({ query: "quay", jurisdiction: "uk" });
    const checks = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checks.map((c) => c.checked)).toEqual([false, false]);

    // Create is unavailable until one is chosen, and clicking it does nothing.
    const createButton = screen.getByRole("button", { name: /^Create case/ }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    fireEvent.click(createButton);
    expect(create).not.toHaveBeenCalled();

    // Choosing one enables it; the case is made from exactly that company.
    fireEvent.click(checks[1]!);
    expect(createButton.disabled).toBe(false);
    fireEvent.click(createButton);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("case-123"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      title: "Quay Street Cleaners Ltd",
      seeds: [{ companyNumber: "00000002" }],
    });
  });

  it('shows "no matches" for zero hits', async () => {
    const { create } = setup([]);
    await screen.findByText("No matches");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  });

  it("starts a US case from an SEC hit by CIK and name, and will not start one from a GLEIF-only hit", async () => {
    const { create } = setup([
      { jurisdiction: "us", source: "sec", key: "320193", name: "Example Inc" },
      { jurisdiction: "us", source: "gleif", key: "5493001KJTIIGC8Y1R12", name: "Example Holdings" },
    ]);
    await screen.findByText("Example Inc");
    const checks = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // The register-only entry is listed but cannot be picked.
    expect(checks).toHaveLength(2);
    expect(checks[1]!.disabled).toBe(true);

    fireEvent.click(checks[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Create case/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      title: "Example Inc",
      seeds: [{ cik: "320193", name: "Example Inc" }],
    });
  });

  it("says when a register could not be searched instead of claiming there were no matches", async () => {
    setup([], "Companies House could not be searched just now.");
    await screen.findByText("Companies House could not be searched just now.");
    expect(screen.queryByText("No matches")).toBeNull();
  });

  it("shows a failed search in plain words, without the framework's action prefix, and lets the person try again", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Action search-entity failed: A Companies House API key is not configured."),
      )
      .mockResolvedValueOnce({ hits: [ukHit("00000001", "Quay Street Laundry Ltd")] });
    render(<NewCase search={search} create={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "quay" } });
    fireEvent.click(screen.getByRole("button", { name: "Search registers" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("A Companies House API key is not configured.");
    expect(screen.queryByText("No matches")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Search registers" }));
    await screen.findByText("Quay Street Laundry Ltd");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
