import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "../db/index.js";
import {
  activity,
  cases,
  changes,
  coverage,
  edges,
  evidence,
  nodes,
  snapshots,
  suggestions,
  watches,
} from "../db/schema.js";
import { assertEvidence, assertTransition } from "./provenance.js";
import type {
  Actor,
  ActivityRow,
  Board,
  BoardEdge,
  BoardNode,
  Case,
  CaseSummary,
  Change,
  CoverageRow,
  EdgeType,
  EvidenceInput,
  EvidenceRow,
  EvidenceSource,
  NodeType,
  Snapshot,
  Status,
  Suggestion,
  Watch,
} from "./types.js";

export class StoreError extends Error {
  constructor(
    readonly code:
      | "case_not_found"
      | "node_not_found"
      | "target_not_found"
      | "status_conflict",
  ) {
    super(code);
    this.name = "StoreError";
  }
}

const newId = () => randomUUID();
const nowIso = () => new Date().toISOString();

// Every function takes the owner and filters every query by it; a case that
// belongs to someone else is indistinguishable from a case that does not exist.
/** One of this owner's cases. Another owner's reads as not found, the same as one that does not exist. */
export async function getCase(caseId: string, ownerEmail: string): Promise<Case> {
  const rows = await getDb()
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.ownerEmail, ownerEmail)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new StoreError("case_not_found");
  return {
    id: row.id,
    ownerEmail: row.ownerEmail,
    title: row.title,
    createdAt: row.createdAt,
  };
}

async function assertCase(caseId: string, ownerEmail: string): Promise<void> {
  await getCase(caseId, ownerEmail);
}

function toEvidenceRow(r: typeof evidence.$inferSelect): EvidenceRow {
  return {
    id: r.id,
    source: r.source as EvidenceSource,
    url: r.url,
    recordId: r.recordId,
    retrievedAt: r.retrievedAt,
    contentHash: r.contentHash,
    ...(r.excerpt != null ? { excerpt: r.excerpt } : {}),
  };
}

function toNode(
  r: typeof nodes.$inferSelect,
  ev: EvidenceRow[],
): BoardNode {
  return {
    id: r.id,
    caseId: r.caseId,
    type: r.type as NodeType,
    key: r.key,
    label: r.label,
    facts: JSON.parse(r.factsJson) as Record<string, string>,
    status: r.status as Status,
    ...(r.reason != null ? { reason: r.reason } : {}),
    addedBy: r.addedBy as Actor,
    ...(r.x != null ? { x: r.x } : {}),
    ...(r.y != null ? { y: r.y } : {}),
    evidence: ev,
    createdAt: r.createdAt,
  };
}

function toEdge(r: typeof edges.$inferSelect, ev: EvidenceRow[]): BoardEdge {
  return {
    id: r.id,
    caseId: r.caseId,
    type: r.type as EdgeType,
    fromId: r.fromId,
    toId: r.toId,
    status: r.status as Status,
    ...(r.reason != null ? { reason: r.reason } : {}),
    addedBy: r.addedBy as Actor,
    evidence: ev,
  };
}

async function insertEvidence(
  caseId: string,
  ownerEmail: string,
  targetKind: "node" | "edge",
  targetId: string,
  list: EvidenceInput[],
): Promise<void> {
  await getDb()
    .insert(evidence)
    .values(
      list.map((e) => ({
        id: newId(),
        ownerEmail,
        caseId,
        targetKind,
        targetId,
        source: e.source,
        url: e.url,
        recordId: e.recordId,
        retrievedAt: e.retrievedAt,
        contentHash: e.contentHash,
        excerpt: e.excerpt ?? null,
        createdAt: nowIso(),
      })),
    );
}

async function evidenceFor(
  caseId: string,
  ownerEmail: string,
  targetKind: "node" | "edge",
  targetIds: string[],
): Promise<Map<string, EvidenceRow[]>> {
  const out = new Map<string, EvidenceRow[]>();
  if (targetIds.length === 0) return out;
  const rows = await getDb()
    .select()
    .from(evidence)
    .where(
      and(
        eq(evidence.caseId, caseId),
        eq(evidence.ownerEmail, ownerEmail),
        eq(evidence.targetKind, targetKind),
        inArray(evidence.targetId, targetIds),
      ),
    )
    .orderBy(asc(evidence.createdAt));
  for (const r of rows) {
    const list = out.get(r.targetId) ?? [];
    list.push(toEvidenceRow(r));
    out.set(r.targetId, list);
  }
  return out;
}

export async function createCase(
  ownerEmail: string,
  title: string,
): Promise<Case> {
  const row = { id: newId(), ownerEmail, title, createdAt: nowIso() };
  await getDb().insert(cases).values(row);
  return row;
}

/** The owner's cases, newest first, each with how many cards it holds and how many still wait for the person. */
export async function listCases(ownerEmail: string): Promise<CaseSummary[]> {
  const db = getDb();
  const [caseRows, nodeRows, edgeRows] = await Promise.all([
    db
      .select()
      .from(cases)
      .where(eq(cases.ownerEmail, ownerEmail))
      .orderBy(desc(cases.createdAt), desc(cases.id)),
    db
      .select({ caseId: nodes.caseId, status: nodes.status })
      .from(nodes)
      .where(eq(nodes.ownerEmail, ownerEmail)),
    db
      .select({ caseId: edges.caseId, status: edges.status })
      .from(edges)
      .where(eq(edges.ownerEmail, ownerEmail)),
  ]);
  const items = new Map<string, number>();
  const proposed = new Map<string, number>();
  for (const n of nodeRows) {
    items.set(n.caseId, (items.get(n.caseId) ?? 0) + 1);
    if (n.status === "proposed") proposed.set(n.caseId, (proposed.get(n.caseId) ?? 0) + 1);
  }
  for (const e of edgeRows) {
    if (e.status === "proposed") proposed.set(e.caseId, (proposed.get(e.caseId) ?? 0) + 1);
  }
  return caseRows.map((c) => ({
    id: c.id,
    ownerEmail: c.ownerEmail,
    title: c.title,
    createdAt: c.createdAt,
    items: items.get(c.id) ?? 0,
    proposed: proposed.get(c.id) ?? 0,
  }));
}

export async function pinNode(i: {
  caseId: string;
  ownerEmail: string;
  type: NodeType;
  key: string;
  label: string;
  facts: Record<string, string>;
  evidence: EvidenceInput[];
  actor: Actor;
  status?: Status;
}): Promise<BoardNode> {
  assertEvidence(i.evidence);
  // Creating an item counts as a move from `proposed`: an agent can only
  // ever create a proposed item.
  assertTransition("proposed", i.status ?? "proposed", i.actor);
  await assertCase(i.caseId, i.ownerEmail);

  const db = getDb();
  await db
    .insert(nodes)
    .values({
      id: newId(),
      ownerEmail: i.ownerEmail,
      caseId: i.caseId,
      type: i.type,
      key: i.key,
      label: i.label,
      factsJson: JSON.stringify(i.facts),
      status: i.status ?? "proposed",
      addedBy: i.actor,
      createdAt: nowIso(),
    })
    .onConflictDoNothing({ target: [nodes.caseId, nodes.type, nodes.key] });

  const [row] = await db
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.caseId, i.caseId),
        eq(nodes.ownerEmail, i.ownerEmail),
        eq(nodes.type, i.type),
        eq(nodes.key, i.key),
      ),
    )
    .limit(1);
  if (!row) throw new StoreError("node_not_found");

  await insertEvidence(i.caseId, i.ownerEmail, "node", row.id, i.evidence);
  const ev = await evidenceFor(i.caseId, i.ownerEmail, "node", [row.id]);
  return toNode(row, ev.get(row.id) ?? []);
}

export async function pinEdge(i: {
  caseId: string;
  ownerEmail: string;
  type: EdgeType;
  fromId: string;
  toId: string;
  evidence: EvidenceInput[];
  actor: Actor;
}): Promise<BoardEdge> {
  assertEvidence(i.evidence);
  await assertCase(i.caseId, i.ownerEmail);

  const db = getDb();
  const ends = [...new Set([i.fromId, i.toId])];
  const found = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.caseId, i.caseId),
        eq(nodes.ownerEmail, i.ownerEmail),
        inArray(nodes.id, ends),
      ),
    );
  if (found.length !== ends.length) throw new StoreError("node_not_found");

  await db
    .insert(edges)
    .values({
      id: newId(),
      ownerEmail: i.ownerEmail,
      caseId: i.caseId,
      type: i.type,
      fromId: i.fromId,
      toId: i.toId,
      status: "proposed",
      addedBy: i.actor,
      createdAt: nowIso(),
    })
    .onConflictDoNothing({
      target: [edges.caseId, edges.type, edges.fromId, edges.toId],
    });

  const [row] = await db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.caseId, i.caseId),
        eq(edges.ownerEmail, i.ownerEmail),
        eq(edges.type, i.type),
        eq(edges.fromId, i.fromId),
        eq(edges.toId, i.toId),
      ),
    )
    .limit(1);
  if (!row) throw new StoreError("target_not_found");

  await insertEvidence(i.caseId, i.ownerEmail, "edge", row.id, i.evidence);
  const ev = await evidenceFor(i.caseId, i.ownerEmail, "edge", [row.id]);
  return toEdge(row, ev.get(row.id) ?? []);
}

export async function setStatus(i: {
  caseId: string;
  ownerEmail: string;
  targetKind: "node" | "edge";
  targetId: string;
  to: Status;
  reason?: string;
  actor: Actor;
  caller?: string;
}): Promise<void> {
  await assertCase(i.caseId, i.ownerEmail);
  const db = getDb();

  const [current] =
    i.targetKind === "node"
      ? await db
          .select({ status: nodes.status })
          .from(nodes)
          .where(
            and(
              eq(nodes.id, i.targetId),
              eq(nodes.caseId, i.caseId),
              eq(nodes.ownerEmail, i.ownerEmail),
            ),
          )
          .limit(1)
      : await db
          .select({ status: edges.status })
          .from(edges)
          .where(
            and(
              eq(edges.id, i.targetId),
              eq(edges.caseId, i.caseId),
              eq(edges.ownerEmail, i.ownerEmail),
            ),
          )
          .limit(1);
  if (!current) throw new StoreError("target_not_found");
  assertTransition(current.status as Status, i.to, i.actor, i.reason);

  const set = { status: i.to, reason: i.reason?.trim() || null };
  const updated =
    i.targetKind === "node"
      ? await db
          .update(nodes)
          .set(set)
          .where(
            and(
              eq(nodes.id, i.targetId),
              eq(nodes.caseId, i.caseId),
              eq(nodes.ownerEmail, i.ownerEmail),
              eq(nodes.status, current.status),
            ),
          )
          .returning({ id: nodes.id })
      : await db
          .update(edges)
          .set(set)
          .where(
            and(
              eq(edges.id, i.targetId),
              eq(edges.caseId, i.caseId),
              eq(edges.ownerEmail, i.ownerEmail),
              eq(edges.status, current.status),
            ),
          )
          .returning({ id: edges.id });
  // The write only lands if the status is still the one the transition was
  // checked against; otherwise someone changed it in between, and an agent's
  // stale write must never undo a person's decision.
  if (updated.length === 0) throw new StoreError("status_conflict");

  await logActivity({
    caseId: i.caseId,
    ownerEmail: i.ownerEmail,
    actor: i.actor,
    caller: i.caller ?? (i.actor === "person" ? "frontend" : "tool"),
    kind: "set-status",
    targetId: i.targetId,
    detail: i.reason ? `${i.to}: ${i.reason}` : i.to,
  });
}

export async function moveNode(
  caseId: string,
  ownerEmail: string,
  nodeId: string,
  x: number,
  y: number,
): Promise<void> {
  await assertCase(caseId, ownerEmail);
  const updated = await getDb()
    .update(nodes)
    .set({ x, y })
    .where(
      and(
        eq(nodes.id, nodeId),
        eq(nodes.caseId, caseId),
        eq(nodes.ownerEmail, ownerEmail),
      ),
    )
    .returning({ id: nodes.id });
  if (updated.length === 0) throw new StoreError("node_not_found");
}

export async function setCoverage(
  caseId: string,
  ownerEmail: string,
  row: CoverageRow,
): Promise<void> {
  await assertCase(caseId, ownerEmail);
  await getDb()
    .insert(coverage)
    .values({
      id: newId(),
      ownerEmail,
      caseId,
      source: row.source,
      state: row.state,
      note: row.note,
    })
    .onConflictDoUpdate({
      target: [coverage.caseId, coverage.source],
      set: { state: row.state, note: row.note },
    });
}

export async function addSuggestion(
  caseId: string,
  ownerEmail: string,
  targetId: string,
  reason: string,
): Promise<Suggestion> {
  await assertCase(caseId, ownerEmail);
  const row = { id: newId(), targetId, reason, status: "open" as const };
  await getDb()
    .insert(suggestions)
    .values({ ...row, ownerEmail, caseId, createdAt: nowIso() });
  return row;
}

export async function addChange(
  ownerEmail: string,
  c: Omit<Change, "id" | "createdAt" | "status">,
): Promise<Change> {
  await assertCase(c.caseId, ownerEmail);
  const row: Change = {
    ...c,
    id: newId(),
    status: "pending",
    createdAt: nowIso(),
  };
  await getDb()
    .insert(changes)
    .values({ ...row, ownerEmail });
  return row;
}

export async function logActivity(i: {
  caseId: string;
  ownerEmail: string;
  actor: Actor;
  caller: string;
  kind: string;
  targetId?: string;
  detail?: string;
}): Promise<void> {
  await assertCase(i.caseId, i.ownerEmail);
  await getDb()
    .insert(activity)
    .values({
      id: newId(),
      ownerEmail: i.ownerEmail,
      caseId: i.caseId,
      actor: i.actor,
      caller: i.caller,
      kind: i.kind,
      targetId: i.targetId ?? null,
      detail: i.detail ?? null,
      at: nowIso(),
    });
}

export async function listBoard(
  caseId: string,
  ownerEmail: string,
): Promise<Board> {
  await assertCase(caseId, ownerEmail);
  const db = getDb();
  const [
    nodeRows,
    edgeRows,
    activityRows,
    coverageRows,
    suggestionRows,
    changeRows,
  ] = await Promise.all([
    db
      .select()
      .from(nodes)
      .where(and(eq(nodes.caseId, caseId), eq(nodes.ownerEmail, ownerEmail)))
      .orderBy(asc(nodes.createdAt)),
    db
      .select()
      .from(edges)
      .where(and(eq(edges.caseId, caseId), eq(edges.ownerEmail, ownerEmail)))
      .orderBy(asc(edges.createdAt)),
    db
      .select()
      .from(activity)
      .where(
        and(eq(activity.caseId, caseId), eq(activity.ownerEmail, ownerEmail)),
      )
      .orderBy(asc(activity.at)),
    db
      .select()
      .from(coverage)
      .where(
        and(eq(coverage.caseId, caseId), eq(coverage.ownerEmail, ownerEmail)),
      ),
    db
      .select()
      .from(suggestions)
      .where(
        and(
          eq(suggestions.caseId, caseId),
          eq(suggestions.ownerEmail, ownerEmail),
        ),
      )
      .orderBy(asc(suggestions.createdAt)),
    db
      .select()
      .from(changes)
      .where(
        and(eq(changes.caseId, caseId), eq(changes.ownerEmail, ownerEmail)),
      )
      .orderBy(asc(changes.createdAt)),
  ]);

  const [nodeEvidence, edgeEvidence] = await Promise.all([
    evidenceFor(caseId, ownerEmail, "node", nodeRows.map((r) => r.id)),
    evidenceFor(caseId, ownerEmail, "edge", edgeRows.map((r) => r.id)),
  ]);

  return {
    nodes: nodeRows.map((r) => toNode(r, nodeEvidence.get(r.id) ?? [])),
    edges: edgeRows.map((r) => toEdge(r, edgeEvidence.get(r.id) ?? [])),
    activity: activityRows.map(
      (r): ActivityRow => ({
        id: r.id,
        caseId: r.caseId,
        actor: r.actor as Actor,
        caller: r.caller,
        kind: r.kind,
        ...(r.targetId != null ? { targetId: r.targetId } : {}),
        ...(r.detail != null ? { detail: r.detail } : {}),
        at: r.at,
      }),
    ),
    coverage: coverageRows.map(
      (r): CoverageRow => ({
        source: r.source,
        state: r.state as CoverageRow["state"],
        note: r.note,
      }),
    ),
    suggestions: suggestionRows.map(
      (r): Suggestion => ({
        id: r.id,
        targetId: r.targetId,
        reason: r.reason,
        status: r.status as Suggestion["status"],
      }),
    ),
    changes: changeRows.map(
      (r): Change => ({
        id: r.id,
        caseId: r.caseId,
        watchId: r.watchId,
        kind: r.kind as Change["kind"],
        summary: r.summary,
        status: r.status as Change["status"],
        createdAt: r.createdAt,
      }),
    ),
  };
}

// ---------------------------------------------------------------- watches, reviews, notes

const toWatch = (r: typeof watches.$inferSelect): Watch => ({
  id: r.id,
  caseId: r.caseId,
  nodeId: r.nodeId,
  companyNumber: r.companyNumber,
  createdAt: r.createdAt,
});

/** Starts watching a company on the board. Watching the same node twice is one watch. */
export async function addWatch(
  caseId: string,
  ownerEmail: string,
  nodeId: string,
  companyNumber: string,
): Promise<Watch> {
  await assertCase(caseId, ownerEmail);
  const db = getDb();
  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.id, nodeId),
        eq(nodes.caseId, caseId),
        eq(nodes.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  if (!node) throw new StoreError("node_not_found");

  const [existing] = await db
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.caseId, caseId),
        eq(watches.ownerEmail, ownerEmail),
        eq(watches.nodeId, nodeId),
      ),
    )
    .limit(1);
  if (existing) return toWatch(existing);

  const row = {
    id: newId(),
    ownerEmail,
    caseId,
    nodeId,
    companyNumber,
    createdAt: nowIso(),
  };
  await db.insert(watches).values(row);
  return toWatch(row);
}

/** This person's watches, across their cases or in one. */
export async function listWatches(
  ownerEmail: string,
  caseId?: string,
): Promise<Watch[]> {
  const rows = await getDb()
    .select()
    .from(watches)
    .where(
      caseId
        ? and(eq(watches.ownerEmail, ownerEmail), eq(watches.caseId, caseId))
        : eq(watches.ownerEmail, ownerEmail),
    )
    .orderBy(asc(watches.createdAt));
  return rows.map(toWatch);
}

export async function listChanges(
  caseId: string,
  ownerEmail: string,
): Promise<Change[]> {
  await assertCase(caseId, ownerEmail);
  const rows = await getDb()
    .select()
    .from(changes)
    .where(and(eq(changes.caseId, caseId), eq(changes.ownerEmail, ownerEmail)))
    .orderBy(asc(changes.createdAt));
  return rows.map(
    (r): Change => ({
      id: r.id,
      caseId: r.caseId,
      watchId: r.watchId,
      kind: r.kind as Change["kind"],
      summary: r.summary,
      status: r.status as Change["status"],
      createdAt: r.createdAt,
    }),
  );
}

/** Records the person's decision on a pending change. A change is decided once. */
export async function reviewChange(
  caseId: string,
  ownerEmail: string,
  changeId: string,
  decision: "accepted" | "dismissed",
): Promise<void> {
  await assertCase(caseId, ownerEmail);
  const db = getDb();
  const match = and(
    eq(changes.id, changeId),
    eq(changes.caseId, caseId),
    eq(changes.ownerEmail, ownerEmail),
  );
  const updated = await db
    .update(changes)
    .set({ status: decision })
    .where(and(match, eq(changes.status, "pending")))
    .returning({ id: changes.id });
  if (updated.length > 0) return;
  const [row] = await db
    .select({ id: changes.id })
    .from(changes)
    .where(match)
    .limit(1);
  throw new StoreError(row ? "status_conflict" : "target_not_found");
}

/**
 * Records the person's decision on an open suggestion. This never changes the
 * suggested item's status: rejecting is a separate, explicit act.
 */
export async function resolveSuggestion(
  caseId: string,
  ownerEmail: string,
  suggestionId: string,
  decision: "accepted" | "dismissed",
): Promise<void> {
  await assertCase(caseId, ownerEmail);
  const db = getDb();
  const match = and(
    eq(suggestions.id, suggestionId),
    eq(suggestions.caseId, caseId),
    eq(suggestions.ownerEmail, ownerEmail),
  );
  const updated = await db
    .update(suggestions)
    .set({ status: decision })
    .where(and(match, eq(suggestions.status, "open")))
    .returning({ id: suggestions.id });
  if (updated.length > 0) return;
  const [row] = await db
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(match)
    .limit(1);
  throw new StoreError(row ? "status_conflict" : "target_not_found");
}

/** A person's note on an item or link. Kept in the activity log, so it carries who and when. */
export async function addAnnotation(i: {
  caseId: string;
  ownerEmail: string;
  targetId: string;
  text: string;
  actor: Actor;
  caller: string;
}): Promise<void> {
  await assertCase(i.caseId, i.ownerEmail);
  const db = getDb();
  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.id, i.targetId),
        eq(nodes.caseId, i.caseId),
        eq(nodes.ownerEmail, i.ownerEmail),
      ),
    )
    .limit(1);
  if (!node) {
    const [edge] = await db
      .select({ id: edges.id })
      .from(edges)
      .where(
        and(
          eq(edges.id, i.targetId),
          eq(edges.caseId, i.caseId),
          eq(edges.ownerEmail, i.ownerEmail),
        ),
      )
      .limit(1);
    if (!edge) throw new StoreError("target_not_found");
  }
  await logActivity({
    caseId: i.caseId,
    ownerEmail: i.ownerEmail,
    actor: i.actor,
    caller: i.caller,
    kind: "annotate",
    targetId: i.targetId,
    detail: i.text,
  });
}

// ---------------------------------------------------------------- snapshots

/** Stores what a watched company looked like. Every check stores one, so the newest says when it was last looked at. */
export async function saveSnapshot(
  ownerEmail: string,
  watchId: string,
  snapshot: Snapshot,
): Promise<void> {
  const db = getDb();
  const [watch] = await db
    .select({ id: watches.id })
    .from(watches)
    .where(and(eq(watches.id, watchId), eq(watches.ownerEmail, ownerEmail)))
    .limit(1);
  if (!watch) throw new StoreError("target_not_found");
  await db.insert(snapshots).values({
    id: newId(),
    ownerEmail,
    watchId,
    officersHash: snapshot.officersHash,
    controllersHash: snapshot.controllersHash,
    filingsHash: snapshot.filingsHash,
    filingCount: snapshot.filingCount,
    takenAt: snapshot.takenAt,
  });
}

/** The newest snapshot of a watch, or undefined if it has never been checked (or is not this owner's). */
export async function latestSnapshot(
  ownerEmail: string,
  watchId: string,
): Promise<Snapshot | undefined> {
  const [row] = await getDb()
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.ownerEmail, ownerEmail), eq(snapshots.watchId, watchId)))
    .orderBy(desc(snapshots.takenAt))
    .limit(1);
  if (!row) return undefined;
  return {
    officersHash: row.officersHash,
    controllersHash: row.controllersHash,
    filingsHash: row.filingsHash,
    filingCount: row.filingCount,
    takenAt: row.takenAt,
  };
}
