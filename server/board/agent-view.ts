import type {
  ActivityRow,
  Board,
  BoardEdge,
  BoardNode,
  Change,
  CoverageRow,
  Observation,
  Suggestion,
} from "./types.js";

/** The board as the person's own screen gets it: everything, with every source row in full. */
export type FullBoard = Board & { caseId: string; title: string; observations: Observation[] };

export const AGENT_LIMITS = {
  /** Cards and strings listed to the agent; more than this are counted, not listed. */
  nodes: 200,
  edges: 300,
  activity: 20,
  /** What `get-board` is allowed to return: the framework's own default (50,000) is too small for a big board. */
  resultChars: 200_000,
} as const;

export interface AgentNode {
  id: string;
  type: BoardNode["type"];
  key: string;
  label: string;
  facts: Record<string, string>;
  status: BoardNode["status"];
  reason?: string;
  addedBy: BoardNode["addedBy"];
  /** Where it came from: the register and record, not the address, date, hash or excerpt. */
  sources: Array<{ source: string; recordId: string }>;
}

export interface AgentEdge {
  id: string;
  type: BoardEdge["type"];
  fromId: string;
  toId: string;
  status: BoardEdge["status"];
  reason?: string;
  addedBy: BoardEdge["addedBy"];
  sources: Array<{ source: string; recordId: string }>;
}

export interface AgentBoard {
  caseId: string;
  title: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  activity: ActivityRow[];
  coverage: CoverageRow[];
  suggestions: Suggestion[];
  changes: Change[];
  observations: Observation[];
  /** Present only when something was left out, with how much. */
  omitted?: { nodes?: number; edges?: number; activity?: number };
}

const sourcesOf = (evidence: BoardNode["evidence"]) =>
  evidence.map((e) => ({ source: e.source, recordId: e.recordId }));

/**
 * A lean read of the board for the agent. The agent keeps a limited amount of any result, and
 * a board cut off part-way could hide a rejected item or dead end it must not propose again,
 * so this keeps every status and reason and drops what only the sources panel needs (urls,
 * hashes, dates, excerpts, and with them month and year of birth). Anything it does leave out
 * is counted in `omitted`.
 */
export function agentBoardView(full: FullBoard): AgentBoard {
  const nodes = full.nodes.slice(0, AGENT_LIMITS.nodes);
  const listed = new Set(nodes.map((n) => n.id));
  const keptEdges = full.edges.filter((e) => listed.has(e.fromId) && listed.has(e.toId));
  const edges = keptEdges.slice(0, AGENT_LIMITS.edges);
  const newestFirst = [...full.activity].sort((a, b) => b.at.localeCompare(a.at));

  const omitted: NonNullable<AgentBoard["omitted"]> = {};
  if (full.nodes.length > nodes.length) omitted.nodes = full.nodes.length - nodes.length;
  if (full.edges.length > edges.length) omitted.edges = full.edges.length - edges.length;
  if (full.activity.length > AGENT_LIMITS.activity) {
    omitted.activity = full.activity.length - AGENT_LIMITS.activity;
  }

  return {
    caseId: full.caseId,
    title: full.title,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      key: n.key,
      label: n.label,
      facts: n.facts,
      status: n.status,
      ...(n.reason ? { reason: n.reason } : {}),
      addedBy: n.addedBy,
      sources: sourcesOf(n.evidence),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      type: e.type,
      fromId: e.fromId,
      toId: e.toId,
      status: e.status,
      ...(e.reason ? { reason: e.reason } : {}),
      addedBy: e.addedBy,
      sources: sourcesOf(e.evidence),
    })),
    activity: newestFirst.slice(0, AGENT_LIMITS.activity),
    coverage: full.coverage,
    suggestions: full.suggestions.filter((s) => s.status === "open"),
    changes: full.changes.filter((c) => c.status === "pending"),
    observations: full.observations,
    ...(Object.keys(omitted).length > 0 ? { omitted } : {}),
  };
}
