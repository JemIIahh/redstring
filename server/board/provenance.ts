import type { Actor, EvidenceInput, Status } from "./types.js";

export type ProvenanceCode =
  | "no_source"
  | "bad_url"
  | "agent_not_allowed"
  | "reason_required"
  | "bad_transition";

export class ProvenanceError extends Error {
  constructor(
    readonly code: ProvenanceCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ProvenanceError";
  }
}

const STATUSES: readonly Status[] = [
  "proposed",
  "confirmed",
  "rejected",
  "dead-end",
];

const isStatus = (s: unknown): s is Status =>
  STATUSES.includes(s as Status);

/** Every pinned item must carry at least one complete, https evidence row. */
export function assertEvidence(evidence: EvidenceInput[]): void {
  if (evidence.length === 0) {
    throw new ProvenanceError("no_source", "at least one source is required");
  }
  for (const e of evidence) {
    if (!e.recordId?.trim() || !e.retrievedAt?.trim() || !e.contentHash?.trim()) {
      throw new ProvenanceError(
        "no_source",
        "each source needs a record id, a retrieved-at time and a content hash",
      );
    }
    let protocol: string;
    try {
      protocol = new URL(e.url).protocol;
    } catch {
      throw new ProvenanceError("bad_url", "the source URL is not a valid URL");
    }
    if (protocol !== "https:") {
      throw new ProvenanceError("bad_url", "the source URL must use https");
    }
  }
}

/**
 * The agent may only leave an item as `proposed`; every other change is the
 * person's judgement. A person may move an item between any two statuses.
 */
export function canTransition(from: Status, to: Status, actor: Actor): boolean {
  if (actor === "person") return true;
  return from === "proposed" && to === "proposed";
}

export function assertTransition(
  from: Status,
  to: Status,
  actor: Actor,
  reason?: string,
): void {
  if (!isStatus(from) || !isStatus(to)) {
    throw new ProvenanceError("bad_transition", `${String(from)} -> ${String(to)}`);
  }
  if (!canTransition(from, to, actor)) {
    throw new ProvenanceError(
      "agent_not_allowed",
      `only a person can move an item from ${from} to ${to}`,
    );
  }
  if ((to === "rejected" || to === "dead-end") && !reason?.trim()) {
    throw new ProvenanceError("reason_required", `a reason is needed for ${to}`);
  }
}
