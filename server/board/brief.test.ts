import { describe, expect, it } from "vitest";

import { sampleBoard } from "../../app/fixtures/laundromat-board";
import { buildBrief, buildSampleBrief, SAMPLE_BRIEF_NOTICE } from "./brief";
import type { Board, BoardEdge, BoardNode, EvidenceRow, Status } from "./types";

const FOOTER = "Based on public records retrieved on the dates shown. Not a finding of wrongdoing.";
const OPTIONS = { title: "Quay Street shells", generatedAt: "2026-11-05T09:30:00.000Z" };

/** The lines between a `## <heading>` and the next heading. */
function section(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l === `## ${heading}`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return end < 0 ? rest : rest.slice(0, end);
}

const bullets = (lines: string[]) => lines.filter((l) => l.startsWith("- "));
const MARKERS = /\[E(\d+)\]/g;
const evidenceNumbers = (markdown: string) =>
  bullets(section(markdown, "Evidence")).map((l) => Number(/^- \[E(\d+)\] /.exec(l)?.[1]));

const ev = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id,
  source: "companies-house",
  url: `https://find-and-update.company-information.service.gov.uk/company/${id}`,
  recordId: id,
  retrievedAt: "2026-11-03T10:00:00.000Z",
  contentHash: `hash-${id}`,
  ...over,
});

const node = (id: string, label: string, status: Status, over: Partial<BoardNode> = {}): BoardNode => ({
  id,
  caseId: "c1",
  type: "company",
  key: id,
  label,
  facts: {},
  status,
  addedBy: "agent",
  evidence: [ev(id)],
  createdAt: "2026-11-03T10:00:00.000Z",
  ...over,
});

const edge = (id: string, from: string, to: string, status: Status, over: Partial<BoardEdge> = {}): BoardEdge => ({
  id,
  caseId: "c1",
  type: "officer-of",
  fromId: from,
  toId: to,
  status,
  addedBy: "agent",
  evidence: [ev(`edge-${id}`)],
  ...over,
});

const board = (over: Partial<Board> = {}): Board => ({
  nodes: [],
  edges: [],
  activity: [],
  coverage: [],
  suggestions: [],
  changes: [],
  ...over,
});

describe("buildBrief", () => {
  it("every line in the findings section ends with a citation marker that exists in the evidence list", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    const findings = bullets(section(markdown, "Findings"));
    expect(findings.length).toBeGreaterThan(0);
    const known = new Set(evidenceNumbers(markdown));
    expect(known.size).toBeGreaterThan(0);
    for (const line of findings) {
      expect(line, line).toMatch(/\[E\d+\](?: \[E\d+\])*$/);
      for (const m of line.matchAll(MARKERS)) expect(known.has(Number(m[1])), `${line} cites E${m[1]}`).toBe(true);
    }
  });

  it("unconfirmed items appear only under \"Unconfirmed\"", () => {
    const { markdown, unconfirmed } = buildBrief(sampleBoard, OPTIONS);
    const proposed = [...sampleBoard.nodes, ...sampleBoard.edges].filter((i) => i.status === "proposed");
    expect(proposed.length).toBeGreaterThan(0);
    expect(unconfirmed).toBe(proposed.length);
    expect(bullets(section(markdown, "Unconfirmed"))).toHaveLength(proposed.length);

    // A card that is only proposed is never listed as a finding or as ruled out. A string in
    // either section may join it, but then the line says the card is not confirmed.
    const others = [...bullets(section(markdown, "Findings")), ...bullets(section(markdown, "Ruled out"))];
    // Two different people can share a name (the sample has one proposed and one rejected
    // "TEAGUE, Marian"), so a name alone cannot say which card a line is about.
    const sharedNames = new Set(sampleBoard.nodes.filter((x) => x.status !== "proposed").map((x) => x.label));
    for (const n of sampleBoard.nodes.filter((x) => x.status === "proposed")) {
      expect(section(markdown, "Unconfirmed").join("\n")).toContain(n.label);
      if (sharedNames.has(n.label)) continue;
      for (const line of others.filter((l) => l.includes(n.label))) {
        expect(line, `${n.label} outside Unconfirmed`).toContain(`${n.label} (not yet confirmed)`);
        expect(line).not.toMatch(/^- (?:(?:Rejected|Dead end): )?(?:Company|Person|Address|Document): /);
      }
    }
  });

  it("says on a confirmed string when the card at one end is not confirmed, or was ruled out", () => {
    const b = board({
      nodes: [
        node("c1", "ONE LTD", "confirmed"),
        node("a1", "1 Quay Street", "proposed", { type: "address" }),
        node("p1", "SOMEONE, Else", "rejected", { type: "person", reason: "Different person." }),
        node("p2", "ELSE, Someone", "dead-end", { type: "person", reason: "Dissolved." }),
      ],
      edges: [
        edge("e1", "c1", "a1", "confirmed", { type: "registered-at" }),
        edge("e2", "p1", "c1", "confirmed"),
        edge("e3", "p2", "c1", "confirmed"),
      ],
    });
    expect(bullets(section(buildBrief(b, OPTIONS).markdown, "Findings"))).toEqual([
      "- Company: ONE LTD [E1]",
      "- ONE LTD · registered at · 1 Quay Street (not yet confirmed) [E2]",
      "- SOMEONE, Else (ruled out) · officer of · ONE LTD [E3]",
      "- ELSE, Someone (dead end) · officer of · ONE LTD [E4]",
    ]);
  });

  it("month and year of birth never appears", () => {
    // The sample's officer sources say "born 03/1975" and "born 11/1962" in their excerpts.
    const withBirth = sampleBoard.nodes.flatMap((n) => n.evidence).filter((e) => /born/.test(e.excerpt ?? ""));
    expect(withBirth.length).toBeGreaterThan(0);

    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    expect(markdown).not.toMatch(/\bborn\b/i);
    expect(markdown).not.toMatch(/\b\d{1,2}\/(19|20)\d{2}\b/);
    expect(markdown).not.toContain("03/1975");
    expect(markdown).not.toContain("11/1962");
  });

  it("withholds a birth date a person typed into a reason, since reasons are copied into the brief", () => {
    const b = board({
      nodes: [
        node("p1", "TEAGUE, Marian", "rejected", {
          type: "person",
          reason: "Different person: born 03/1975 here, 11/1962 on the other card.",
        }),
      ],
    });
    const { markdown } = buildBrief(b, OPTIONS);
    expect(markdown).not.toContain("03/1975");
    expect(markdown).not.toContain("11/1962");
    expect(markdown).toContain("Different person");
  });

  it("the footer is the exact string, and the last line", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    expect(markdown.trimEnd().split("\n").pop()).toBe(FOOTER);
    expect(markdown.split(FOOTER)).toHaveLength(2);
    // Also on a brief with nothing in it.
    expect(buildBrief(board(), OPTIONS).markdown.trimEnd().split("\n").pop()).toBe(FOOTER);
  });

  it("rejected and dead-end items are listed under \"Ruled out\" with their reasons", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    const ruled = bullets(section(markdown, "Ruled out"));
    const decided = [...sampleBoard.nodes, ...sampleBoard.edges].filter(
      (i) => i.status === "rejected" || i.status === "dead-end",
    );
    expect(decided.length).toBeGreaterThan(0);
    expect(ruled).toHaveLength(decided.length);
    for (const item of decided) {
      const line = ruled.find((l) => l.includes(item.reason!));
      expect(line, `${item.id}: ${item.reason}`).toBeTruthy();
      expect(line).toMatch(item.status === "rejected" ? /^- Rejected/ : /^- Dead end/);
    }
    // Nothing ruled out is also a finding.
    const findings = section(markdown, "Findings").join("\n");
    for (const n of sampleBoard.nodes.filter((x) => x.status === "rejected" || x.status === "dead-end")) {
      expect(findings).not.toContain(n.label);
    }
  });

  it("lists confirmed cards and strings first, with the company a string joins named, and counts the sources", () => {
    const b = board({
      nodes: [
        node("c1", "HARLOW QUAY TRADING LLP", "confirmed", { facts: { number: "OC900101", type: "llp", status: "active" } }),
        node("p1", "KOTHARI, Dev", "confirmed", { type: "person", facts: { role: "llp-member" } }),
      ],
      edges: [edge("e1", "p1", "c1", "confirmed", { type: "member-of" })],
    });
    const { markdown, citations, unconfirmed } = buildBrief(b, OPTIONS);
    const findings = bullets(section(markdown, "Findings"));
    expect(findings).toEqual([
      "- Company: HARLOW QUAY TRADING LLP (OC900101 · llp · active) [E1]",
      "- Person: KOTHARI, Dev (llp-member) [E2]",
      "- KOTHARI, Dev · member of · HARLOW QUAY TRADING LLP [E3]",
    ]);
    expect(citations).toBe(3);
    expect(unconfirmed).toBe(0);
  });

  it("gives one number to a record that backs several items, and says where it came from and when", () => {
    const shared = ev("OC900101");
    const b = board({
      nodes: [
        node("c1", "ONE LTD", "confirmed", { evidence: [shared] }),
        node("c2", "TWO LTD", "confirmed", { evidence: [shared, ev("OC900102")] }),
      ],
    });
    const { markdown, citations } = buildBrief(b, OPTIONS);
    expect(bullets(section(markdown, "Findings"))).toEqual([
      "- Company: ONE LTD [E1]",
      "- Company: TWO LTD [E1] [E2]",
    ]);
    expect(citations).toBe(2);
    expect(bullets(section(markdown, "Evidence"))[0]).toBe(
      "- [E1] Companies House · https://find-and-update.company-information.service.gov.uk/company/OC900101 · record OC900101 · retrieved 2026-11-03",
    );
  });

  it("says what was searched, in the same words the screen uses, so a missing source is not read as a clean result", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    const searched = section(markdown, "What was searched").join("\n");
    expect(searched).toMatch(/Companies House \(partners\): not read/);
    expect(searched).toMatch(/GLEIF: no match/);
    expect(searched).not.toMatch(/clean|all clear/i);
  });

  it("is plain when there is nothing yet: no invented findings, and still the footer", () => {
    const { markdown, citations, unconfirmed } = buildBrief(board(), OPTIONS);
    expect(markdown).toContain("None confirmed yet.");
    expect(bullets(section(markdown, "Findings"))).toEqual([]);
    expect(citations).toBe(0);
    expect(unconfirmed).toBe(0);
  });

  it("copies record text as text: a name cannot add a fake citation, a heading or a link", () => {
    const b = board({
      nodes: [
        node("c1", "EVIL [E99] LTD\n## Findings\n- fake [E1]", "confirmed"),
        node("c2", "[click](https://example.com) <b>x</b>", "proposed"),
      ],
    });
    const { markdown } = buildBrief(b, OPTIONS);
    const known = new Set(evidenceNumbers(markdown));
    for (const line of bullets(section(markdown, "Findings"))) {
      for (const m of line.matchAll(MARKERS)) expect(known.has(Number(m[1]))).toBe(true);
    }
    expect(markdown.split("\n").filter((l) => l === "## Findings")).toHaveLength(1);
    // The brackets are escaped, so it is text and not a link.
    expect(markdown).not.toMatch(/(?<!\\)\]\(/);
    expect(markdown).toContain("\\[click\\]");
    expect(markdown).not.toContain("<b>");
  });

  it("refuses to write a finding that has no source, rather than print an uncited one", () => {
    const b = board({ nodes: [node("c1", "NO SOURCE LTD", "confirmed", { evidence: [] })] });
    expect(() => buildBrief(b, OPTIONS)).toThrow(/no source/i);
  });

  it("puts the title and the date at the top and nothing the agent wrote into the body", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    const [first, , second] = markdown.split("\n");
    expect(first).toBe("# Quay Street shells");
    expect(second).toBe("Prepared 2026-11-05.");
    // Suggestions are the agent's own words; they are not part of the brief.
    for (const s of sampleBoard.suggestions) expect(markdown).not.toContain(s.reason);
  });
  it("prints no match score for an ICIJ candidate, on a finding or in the ruled-out list", () => {
    const { markdown } = buildBrief(sampleBoard, OPTIONS);
    expect(markdown).toContain("ICIJ candidate: HARLOW QUAY");
    expect(markdown).not.toMatch(/score/i);
    const scored = board({
      nodes: [
        node("d1", "ICIJ candidate: ACME HOLDINGS", "rejected", { type: "document", facts: { score: "87" }, reason: "Different address." }),
      ],
    });
    expect(buildBrief(scored, OPTIONS).markdown).not.toMatch(/score|87/i);
  });
  it("a brief of the sample board says at the top that it is invented; a real brief carries no such line", () => {
    const sample = buildSampleBrief(sampleBoard, OPTIONS).markdown;
    const lines = sample.split("\n");
    expect(lines.indexOf(SAMPLE_BRIEF_NOTICE)).toBeGreaterThan(0);
    expect(lines.indexOf(SAMPLE_BRIEF_NOTICE)).toBeLessThan(lines.indexOf("## Findings"));
    expect(SAMPLE_BRIEF_NOTICE).toMatch(/^SAMPLE DATA/);
    expect(sample).toContain(FOOTER);
    expect(buildBrief(sampleBoard, OPTIONS).markdown).not.toContain("SAMPLE DATA");
  });

  it("no source on the invented sample board points at a real report page", () => {
    const urls = [...sampleBoard.nodes, ...sampleBoard.edges].flatMap((i) => i.evidence.map((e) => e.url));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => /occrp\.org/.test(u))).toEqual([]);
  });
});
