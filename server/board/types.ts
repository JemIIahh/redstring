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

export interface Board {
  nodes: BoardNode[];
  edges: BoardEdge[];
  activity: ActivityRow[];
  coverage: CoverageRow[];
  suggestions: Suggestion[];
  changes: Change[];
}

export interface Observation {
  kind: "shared-address" | "shared-officer";
  count: number;
  nodeIds: string[];
  evidenceIds: string[];
}
