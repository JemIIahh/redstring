export type NodeType = "company" | "person" | "address" | "document";
export type EdgeType =
  | "officer-of"
  | "member-of"
  | "controls"
  | "registered-at"
  | "same-address"
  | "candidate-match";
export type Status = "proposed" | "confirmed" | "rejected" | "dead-end";
export type Actor = "person" | "agent";

export type EvidenceSource =
  | "companies-house"
  | "icij"
  | "gleif"
  | "sec"
  | "occrp"
  | "manual";

export interface EvidenceInput {
  source: EvidenceSource;
  url: string;
  recordId: string;
  retrievedAt: string;
  contentHash: string;
  excerpt?: string;
}

export interface EvidenceRow extends EvidenceInput {
  id: string;
}

export interface Case {
  id: string;
  ownerEmail: string;
  title: string;
  createdAt: string;
}

/** A case as the list shows it: enough to pick the right one, nothing from inside it. */
export interface CaseSummary extends Case {
  /** Cards on the board (every status). */
  items: number;
  /** Cards and links the agent proposed that the person has not decided yet. */
  proposed: number;
}

export interface BoardNode {
  id: string;
  caseId: string;
  type: NodeType;
  key: string;
  label: string;
  facts: Record<string, string>;
  status: Status;
  reason?: string;
  addedBy: Actor;
  x?: number;
  y?: number;
  evidence: EvidenceRow[];
  createdAt: string;
}

export interface BoardEdge {
  id: string;
  caseId: string;
  type: EdgeType;
  fromId: string;
  toId: string;
  status: Status;
  reason?: string;
  addedBy: Actor;
  evidence: EvidenceRow[];
}

export interface ActivityRow {
  id: string;
  caseId: string;
  actor: Actor;
  caller: string;
  kind: string;
  targetId?: string;
  detail?: string;
  at: string;
}

export type CoverageState =
  | "searched"
  | "no_match"
  | "incomplete"
  | "not_read"
  | "not_available";

export interface CoverageRow {
  source: string;
  state: CoverageState;
  note: string;
}

export interface Suggestion {
  id: string;
  targetId: string;
  reason: string;
  status: "open" | "accepted" | "dismissed";
}

export interface Change {
  id: string;
  caseId: string;
  watchId: string;
  kind: "officers" | "controllers" | "filings";
  summary: string;
  status: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export interface Watch {
  id: string;
  caseId: string;
  nodeId: string;
  companyNumber: string;
  createdAt: string;
}

/** What a watched company's register entries looked like at one moment: hashes, so two can be compared. */
export interface Snapshot {
  officersHash: string;
  controllersHash: string;
  filingsHash: string;
  filingCount: number;
  takenAt: string;
}

export interface Board {
  nodes: BoardNode[];
  edges: BoardEdge[];
  activity: ActivityRow[];
  coverage: CoverageRow[];
  suggestions: Suggestion[];
  changes: Change[];
}

/**
 * A pattern worked out in code from stored records: counts and ids only, no
 * wording. `count` is the number of companies in the group. When the group
 * hangs off a shared address or a shared officer, that node's id comes first
 * in `nodeIds`, followed by the companies; a group joined only by
 * same-address links lists just the companies.
 */
export interface Observation {
  kind: "shared-address" | "shared-officer";
  count: number;
  nodeIds: string[];
  evidenceIds: string[];
}
