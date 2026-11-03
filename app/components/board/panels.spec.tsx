// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActivityRow,
  BoardNode,
  CoverageRow,
  EvidenceRow,
  Observation,
} from "../../../server/board/types";
import { ActivityLog } from "./ActivityLog";
import { tabAfterSelect } from "./CasePanel";
import { CoveragePanel } from "./CoveragePanel";
import { EvidencePanel } from "./EvidencePanel";
import { GoDeeper } from "./GoDeeper";
import { KnownListCheck } from "./KnownListCheck";
import { NodeCard } from "./NodeCard";
import { ObservationsStrip } from "./ObservationsStrip";
import { StatusControlsView } from "./StatusControls";

afterEach(cleanup);

const row = (over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id: "ev1",
  source: "companies-house",
  url: "https://find-and-update.company-information.service.gov.uk/company/OC372263/officers",
  recordId: "OC372263/officers",
  retrievedAt: "2026-11-03T10:15:00.000Z",
  contentHash: "9f2c1d7a8b3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8",
  ...over,
});

const person = (): BoardNode => ({
  id: "p1",
  caseId: "c1",
  type: "person",
  key: "officer:abc",
  label: "ANNA EXAMPLE",
  facts: { role: "member" },
  status: "proposed",
  addedBy: "agent",
  evidence: [row({ excerpt: "member · appointed 2012-03-01 · born 03/1975 · British" })],
  createdAt: "2026-11-03T10:00:00.000Z",
});

describe("StatusControlsView", () => {
  const target = { kind: "node" as const, id: "n1", status: "proposed" as const };

  it("reject asks for a reason and blocks submit without one", async () => {
    const setStatus = vi.fn(async () => ({}));
    render(<StatusControlsView caseId="c1" target={target} setStatus={setStatus} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const submit = screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement;
    const box = screen.getByLabelText(/why/i) as HTMLTextAreaElement;

    // No reason, and a reason of only spaces, both block the submit.
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    fireEvent.change(box, { target: { value: "   " } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(setStatus).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "Different company, same name" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(setStatus).toHaveBeenCalledTimes(1));
    expect(setStatus).toHaveBeenCalledWith({
      caseId: "c1",
      targetKind: "node",
      targetId: "n1",
      to: "rejected",
      reason: "Different company, same name",
    });
  });

  it("asks for a reason on a dead end too, and confirm needs none", async () => {
    const setStatus = vi.fn(async () => ({}));
    render(<StatusControlsView caseId="c1" target={target} setStatus={setStatus} />);

    fireEvent.click(screen.getByRole("button", { name: "Dead end" }));
    expect((screen.getByRole("button", { name: "Mark as dead end" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledTimes(1));
    expect(setStatus).toHaveBeenCalledWith({
      caseId: "c1",
      targetKind: "node",
      targetId: "n1",
      to: "confirmed",
    });
  });

  it("does not offer the status the item already has, and says in words when saving fails", async () => {
    const setStatus = vi.fn().mockRejectedValue(new Error("Action set-status failed: That item is gone."));
    render(
      <StatusControlsView
        caseId="c1"
        target={{ kind: "edge", id: "e1", status: "confirmed" }}
        setStatus={setStatus}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to proposed" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That item is gone.");
  });
});

describe("EvidencePanel", () => {
  it("shows month and year of birth, the node card does not", () => {
    const node = person();
    const { unmount } = render(<EvidencePanel title={node.label} evidence={node.evidence} />);
    expect(screen.getByText(/born 03\/1975/)).toBeTruthy();
    unmount();

    render(<NodeCard node={node} />);
    expect(document.body.textContent).not.toMatch(/1975/);
    expect(document.body.textContent).not.toMatch(/born/);
  });

  it("lists source, link, record id, retrieved date and a short hash for every row", () => {
    render(
      <EvidencePanel
        title="LCM ALLIANCE LLP"
        evidence={[row(), row({ id: "ev2", source: "icij", url: "https://offshoreleaks.icij.org/nodes/1", recordId: "node-1" })]}
      />,
    );
    expect(screen.getByText("Companies House")).toBeTruthy();
    expect(screen.getByText("ICIJ Offshore Leaks")).toBeTruthy();
    expect(screen.getByText("OC372263/officers")).toBeTruthy();
    expect(screen.getAllByText(/Retrieved 3 Nov 2026/)).toHaveLength(2);
    expect(screen.getAllByText(/9f2c1d7a/).length).toBe(2);
    const links = screen.getAllByRole("link") as HTMLAnchorElement[];
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("href")).toBe(row().url);
    expect(links[0]!.getAttribute("rel")).toContain("noopener");
    expect(links[0]!.getAttribute("target")).toBe("_blank");
  });

  it("does not make a link out of a source address that is not https", () => {
    render(<EvidencePanel title="x" evidence={[row({ url: "javascript:alert(1)" })]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("CoveragePanel", () => {
  it('shows an empty ICIJ result as "no match", not as an error', () => {
    const coverage: CoverageRow[] = [
      { source: "icij", state: "no_match", note: "No candidates for this name in Offshore Leaks" },
    ];
    render(<CoveragePanel coverage={coverage} />);
    expect(screen.getByText("ICIJ Offshore Leaks")).toBeTruthy();
    expect(screen.getByText("no match")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toMatch(/error|failed/i);
  });

  it("says plainly what was cut short or not read", () => {
    render(
      <CoveragePanel
        coverage={[
          { source: "companies-house", state: "incomplete", note: "Stopped at 100 officers" },
          { source: "companies-house-partners", state: "not_read", note: "Scanned filings are not read" },
          { source: "us-register", state: "not_available", note: "Not connected" },
        ]}
      />,
    );
    expect(screen.getByText("incomplete")).toBeTruthy();
    expect(screen.getByText("not read")).toBeTruthy();
    expect(screen.getByText("not available")).toBeTruthy();
    expect(screen.getByText("Stopped at 100 officers")).toBeTruthy();
  });

  it("says when nothing has been searched", () => {
    render(<CoveragePanel coverage={[]} />);
    expect(screen.getByText("Nothing has been searched yet.")).toBeTruthy();
  });
});

describe("ActivityLog", () => {
  const rows: ActivityRow[] = [
    { id: "a1", caseId: "c1", actor: "person", caller: "frontend", kind: "set-status", targetId: "n1", detail: "confirmed", at: "2026-11-03T10:00:00.000Z" },
    { id: "a2", caseId: "c1", actor: "agent", caller: "tool", kind: "expand", targetId: "n1", detail: "3 added", at: "2026-11-03T10:05:00.000Z" },
  ];

  it("marks agent rows differently from person rows", () => {
    render(<ActivityLog rows={rows} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Newest first.
    expect(items[0]!.getAttribute("data-actor")).toBe("agent");
    expect(items[1]!.getAttribute("data-actor")).toBe("person");
    expect(items[0]!.textContent).toContain("Agent");
    expect(items[1]!.textContent).toContain("You");
    expect(items[0]!.className).not.toBe(items[1]!.className);
  });

  it("uses a plain phrase for what happened and falls back to the raw kind for one it does not know", () => {
    render(
      <ActivityLog
        rows={[
          ...rows,
          { id: "a3", caseId: "c1", actor: "agent", caller: "tool", kind: "brand-new-kind", at: "2026-11-03T10:06:00.000Z" },
        ]}
      />,
    );
    expect(screen.getByText(/Marked an item confirmed|Confirmed/i)).toBeTruthy();
    expect(screen.getByText(/brand new kind/i)).toBeTruthy();
  });

  it("says when nothing has happened yet", () => {
    render(<ActivityLog rows={[]} />);
    expect(screen.getByText("Nothing yet.")).toBeTruthy();
  });
});

describe("ObservationsStrip", () => {
  const nodes = ["a", "b", "c", "d"].map(
    (id, i): BoardNode => ({
      id,
      caseId: "c1",
      type: i === 0 ? "address" : "company",
      key: id,
      label: i === 0 ? "1 QUAY STREET" : `COMPANY ${id.toUpperCase()}`,
      facts: {},
      status: "confirmed",
      addedBy: "person",
      evidence: [],
      createdAt: "2026-11-03T10:00:00.000Z",
    }),
  );

  it('renders counts like "3 companies at this address" with a way to open each node', () => {
    const obs: Observation[] = [{ kind: "shared-address", count: 3, nodeIds: ["a", "b", "c", "d"], evidenceIds: [] }];
    const onOpenNode = vi.fn();
    render(<ObservationsStrip observations={obs} nodes={nodes} onOpenNode={onOpenNode} />);
    expect(screen.getByText("3 companies at this address")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "COMPANY C" }));
    expect(onOpenNode).toHaveBeenCalledWith("c");
    fireEvent.click(screen.getByRole("button", { name: "1 QUAY STREET" }));
    expect(onOpenNode).toHaveBeenCalledWith("a");
  });

  it("words a shared officer and a group with no shared node", () => {
    const obs: Observation[] = [
      { kind: "shared-officer", count: 2, nodeIds: ["a", "b", "c"], evidenceIds: [] },
      { kind: "shared-address", count: 2, nodeIds: ["b", "c"], evidenceIds: [] },
    ];
    render(<ObservationsStrip observations={obs} nodes={nodes} onOpenNode={() => {}} />);
    expect(screen.getByText("2 companies share an officer")).toBeTruthy();
    expect(screen.getByText("2 companies at the same address")).toBeTruthy();
  });

  it("says when there is nothing to point out", () => {
    render(<ObservationsStrip observations={[]} nodes={nodes} onOpenNode={() => {}} />);
    expect(screen.getByText("No patterns yet.")).toBeTruthy();
  });
});

describe("GoDeeper", () => {
  it("sends the person's text and the selected ids to the agent chat", () => {
    const send = vi.fn(() => "msg-1");
    render(<GoDeeper caseId="c1" selectedIds={["n1", "n2"]} send={send} />);
    const button = screen.getByRole("button", { name: "Send to agent" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/ask the agent/i), { target: { value: "Who else sits at this address?" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    expect(send).toHaveBeenCalledTimes(1);
    const arg = (send.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.message).toBe("Who else sits at this address?");
    expect(String(arg.context)).toContain("n1");
    expect(String(arg.context)).toContain("n2");
    expect(String(arg.context)).toContain("c1");
    expect(arg.submit).toBe(true);
    // The box empties once sent.
    expect((screen.getByLabelText(/ask the agent/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("will not send with nothing selected", () => {
    const send = vi.fn(() => "msg-1");
    render(<GoDeeper caseId="c1" selectedIds={[]} send={send} />);
    fireEvent.change(screen.getByLabelText(/ask the agent/i), { target: { value: "More?" } });
    expect((screen.getByRole("button", { name: "Send to agent" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/select a card first/i)).toBeTruthy();
  });
});

describe("KnownListCheck", () => {
  it("checks a pasted list against the board and says what is not on it", () => {
    const nodes: BoardNode[] = [
      { ...person(), id: "x1", type: "company", label: "METASTAR LLP", key: "OC346224", facts: { number: "OC346224" }, status: "confirmed" },
    ];
    render(<KnownListCheck board={{ nodes }} />);
    fireEvent.change(screen.getByLabelText(/published list/i), {
      target: { value: "Metastar L.L.P.\nNowhere Holdings Ltd\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check list" }));
    expect(screen.getByText("1 of 2 are on this board")).toBeTruthy();
    expect(screen.getByText("Nowhere Holdings Ltd")).toBeTruthy();
    expect(screen.getByText("Not on this board")).toBeTruthy();
  });
});

describe("tabAfterSelect", () => {
  it("opens the selected item's sources on any pick, even when another panel was last open or none is", () => {
    expect(tabAfterSelect(null, ["n1"])).toBe("item");
    expect(tabAfterSelect("coverage", ["n1"])).toBe("item");
    expect(tabAfterSelect("item", ["n1", "e2"])).toBe("item");
  });

  it("closes only the item panel when the pick is cleared, and leaves a case-wide panel alone", () => {
    expect(tabAfterSelect("item", [])).toBeNull();
    expect(tabAfterSelect("activity", [])).toBe("activity");
    expect(tabAfterSelect(null, [])).toBeNull();
  });
});
