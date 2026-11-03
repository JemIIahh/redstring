import type { Board, BoardEdge, BoardNode, EvidenceRow } from "./types.js";
import { COVERAGE_WORD, EDGE_WORDS, factsLine, sourceLabel, TYPE_WORD } from "./wording.js";

/** The closing line of every brief, word for word. */
export const BRIEF_FOOTER = "Based on public records retrieved on the dates shown. Not a finding of wrongdoing.";

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

const WITHHELD = "[date withheld]";

/**
 * Month and year of birth is kept to tell same-name people apart and is never exported. It only
 * ever sits in a source excerpt, which the brief does not copy; but a person's own reason can
 * quote it ("born 03/1975"), so the forms people write it in are withheld from reasons too.
 */
export function withholdBirthDates(text: string): string {
  return text
    .replace(
      /\b(?:born|dob|date of birth)\b[:\s]*(?:in\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{0,2}\/?(?:19|20)\d{2}\b/gi,
      WITHHELD,
    )
    .replace(/\b\d{1,2}\/(?:19|20)\d{2}\b/g, WITHHELD);
}

/**
 * Text copied from a record or typed by the person, as one plain line of markdown: no line
 * breaks (so it cannot start a heading or a list), and the characters that make links, emphasis,
 * HTML or a fake `[E1]` citation are escaped.
 */
function plain(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_[\]<>|]/g, (c) => `\\${c}`);
}

const dayOf = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : plain(iso));

/** An address from a record, kept copyable: no spaces, angle brackets or line breaks. */
const urlText = (url: string): string =>
  url
    .replace(/\p{Cc}+/gu, "")
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");

/** Numbers the records the brief cites, in the order they are first cited; one record, one number. */
class Evidence {
  private readonly byKey = new Map<string, number>();
  readonly rows: EvidenceRow[] = [];

  number(r: EvidenceRow): number {
    const key = [r.source, r.url, r.recordId, dayOf(r.retrievedAt)].join("|");
    const known = this.byKey.get(key);
    if (known !== undefined) return known;
    this.rows.push(r);
    this.byKey.set(key, this.rows.length);
    return this.rows.length;
  }
}

type Item = BoardNode | BoardEdge;

/**
 * The case as a document a person can hand on: what they confirmed, with every line pointing at
 * the public record it came from; what is still only proposed, kept apart; what they ruled out and
 * why; and what was and was not searched. It copies nothing the agent wrote, no source excerpts
 * (which is where birth month and year live) and no scores. A confirmed or proposed item with no
 * source is a broken row, so it stops the export instead of printing an uncited line.
 */
export function buildBrief(
  board: Board,
  o: { title: string; generatedAt: string; notice?: string },
): { markdown: string; citations: number; unconfirmed: number } {
  const evidence = new Evidence();
  const nodeById = new Map(board.nodes.map((n) => [n.id, n]));
  // A string can be confirmed while a card at its end is not. Say so, so the line is not read as
  // confirming that card.
  const STANDING: Partial<Record<BoardNode["status"], string>> = {
    proposed: " (not yet confirmed)",
    rejected: " (ruled out)",
    "dead-end": " (dead end)",
  };
  const endLabel = (id: string) => {
    const n = nodeById.get(id);
    return n ? `${plain(n.label)}${STANDING[n.status] ?? ""}` : "an item";
  };

  const describe = (item: Item): string => {
    if ("label" in item) {
      // A candidate's match score is the register's number for how alike two names look: it stays on the
      // screen, not in a brief, which carries no scores.
      const facts = item.type === "document" ? "" : factsLine(item);
      return `${TYPE_WORD[item.type]}: ${plain(item.label)}${facts ? ` (${plain(facts)})` : ""}`;
    }
    return `${endLabel(item.fromId)} · ${EDGE_WORDS[item.type]} · ${endLabel(item.toId)}`;
  };

  const cite = (item: Item): string => {
    if (item.evidence.length === 0) {
      throw new BriefError(`"${describe(item)}" has no source, so it cannot be put in a brief.`);
    }
    return item.evidence.map((r) => `[E${evidence.number(r)}]`).join(" ");
  };

  const items = (status: (s: Item["status"]) => boolean): Item[] => [
    ...board.nodes.filter((n) => status(n.status)),
    ...board.edges.filter((e) => status(e.status)),
  ];

  const finding = (i: Item) => `- ${describe(i)} ${cite(i)}`;
  const confirmed = items((s) => s === "confirmed").map(finding);
  const proposed = items((s) => s === "proposed").map(finding);
  const ruledOut = items((s) => s === "rejected" || s === "dead-end").map((i) => {
    const why = i.reason ? plain(withholdBirthDates(i.reason)) : "no reason recorded";
    return `- ${i.status === "rejected" ? "Rejected" : "Dead end"}: ${describe(i)} — ${why} ${cite(i)}`;
  });

  const searched = board.coverage.map(
    (c) => `- ${sourceLabel(c.source)}: ${COVERAGE_WORD[c.state]}.${c.note ? ` ${plain(c.note)}` : ""}`,
  );
  const sources = evidence.rows.map(
    (r, i) =>
      `- [E${i + 1}] ${sourceLabel(r.source)} · ${urlText(r.url)} · record ${plain(r.recordId)} · retrieved ${dayOf(r.retrievedAt)}`,
  );

  const when = /^\d{4}-\d{2}-\d{2}/.test(o.generatedAt) ? o.generatedAt.slice(0, 10) : plain(o.generatedAt);
  const lines = [
    `# ${plain(o.title)}`,
    "",
    `Prepared ${when}.`,
    "",
    ...(o.notice ? [o.notice, ""] : []),
    "## Findings",
    "",
    ...(confirmed.length > 0
      ? ["Confirmed by a person.", "", ...confirmed]
      : ["None confirmed yet."]),
    "",
    "## Unconfirmed",
    "",
    ...(proposed.length > 0
      ? ["Proposed and not yet confirmed by a person. Do not rely on these.", "", ...proposed]
      : ["None."]),
    "",
    "## Ruled out",
    "",
    ...(ruledOut.length > 0
      ? ["Rejected or marked a dead end by a person, with their reasons.", "", ...ruledOut]
      : ["None."]),
    "",
    "## What was searched",
    "",
    ...(searched.length > 0 ? searched : ["Nothing has been searched yet."]),
    "",
    "## Evidence",
    "",
    ...(sources.length > 0 ? sources : ["None."]),
    "",
    BRIEF_FOOTER,
    "",
  ];

  return { markdown: lines.join("\n"), citations: evidence.rows.length, unconfirmed: proposed.length };
}

/** First line of any brief made from the invented sample board. */
export const SAMPLE_BRIEF_NOTICE =
  "SAMPLE DATA: every company, person and address in this brief is invented, and its source links do not lead to real records.";

/** A brief of the invented sample board: the same document, marked so it cannot be passed off as findings. */
export function buildSampleBrief(board: Board, o: { title: string; generatedAt: string }) {
  return buildBrief(board, { ...o, notice: SAMPLE_BRIEF_NOTICE });
}
