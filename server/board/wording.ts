// Plain words for things on the board, shared by the screen and by the exported brief so the
// two never describe the same record differently. No UI imports: the server uses this too.
import type { BoardNode, CoverageState, EdgeType, NodeType } from "./types.js";

export const EDGE_WORDS: Record<EdgeType, string> = {
  "officer-of": "officer of",
  "member-of": "member of",
  controls: "controls",
  "registered-at": "registered at",
  "same-address": "same address",
  "candidate-match": "candidate match",
};

export const TYPE_WORD: Record<NodeType, string> = {
  company: "Company",
  person: "Person",
  address: "Address",
  document: "Document",
};

const SOURCE_LABEL: Record<string, string> = {
  "companies-house": "Companies House",
  "companies-house-partners": "Companies House (partners)",
  icij: "ICIJ Offshore Leaks",
  gleif: "GLEIF",
  sec: "SEC",
  "us-register": "US register",
  occrp: "OCCRP",
  manual: "Added by hand",
};

/** A source's name as the person would say it. An unknown key is shown as it is. */
export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/** Coverage states in words. An empty result is "no match": the source answered, and nothing matched. */
export const COVERAGE_WORD: Record<CoverageState, string> = {
  searched: "searched",
  no_match: "no match",
  incomplete: "incomplete",
  not_read: "not read",
  not_available: "not available",
};

/** One line of the record's own facts: number, kind, standing. Birth dates never appear here. */
export function factsLine(node: Pick<BoardNode, "type" | "key" | "facts">): string {
  const f = node.facts;
  if (node.type === "company" && f.number) {
    return [f.number, f.type, f.status, f.former ? `formerly ${f.former}` : ""].filter(Boolean).join(" · ");
  }
  if (node.type === "document" && f.score) return `score ${f.score}`;
  return [f.role, f.status].filter(Boolean).join(" · ");
}
