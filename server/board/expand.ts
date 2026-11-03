import type { CompanyProfile } from "../sources/companies-house.js";
import type { Sources } from "../sources/registry.js";
import { SourceError, type SourceResult } from "../sources/types.js";
import { CapError } from "../usage/caps.js";
import {
  listBoard,
  logActivity,
  pinEdge,
  pinNode,
  setCoverage,
  StoreError,
} from "./store.js";
import type {
  Actor,
  BoardEdge,
  BoardNode,
  CoverageState,
  EdgeType,
  EvidenceInput,
  EvidenceRow,
  NodeType,
} from "./types.js";

export type ExpandPart =
  | "officers"
  | "controllers"
  | "address"
  | "filings"
  | "leaks"
  | "neighbours";

/** A search result. Nothing here is on the board until a person picks it. */
export interface EntityHit {
  jurisdiction: "uk" | "us";
  source: "companies-house" | "sec" | "gleif";
  /** Company number (UK), CIK (SEC) or LEI (GLEIF). */
  key: string;
  name: string;
  status?: string;
  address?: string;
  detail?: string;
}

export interface ExpandResult {
  pinnedNodes: number;
  pinnedEdges: number;
  /** Sources that were not read in full (cut short, refused, or not configured). */
  incomplete: string[];
  /** Rejected or dead-end items the search found again and left alone. */
  skippedDeadEnds: number;
  /** Plain statements about what was and was not read, for the agent to pass on. */
  notes: string[];
}

export class ExpandError extends Error {
  constructor(
    readonly code: "bad_node",
    message: string,
  ) {
    super(message);
    this.name = "ExpandError";
  }
}

const PARTNER_NOTE =
  "Partners are not in the register data; they may be in scanned filings, which are not read.";
const US_NOTE = "The US has no public officer or owner register.";
const OFFICER_CAP = 50;
const NEIGHBOUR_CAP = 50;
const FILING_CAP = 20;
const US_FILING_CAP = 10;
const ICIJ_CAP = 5;

const CH = "companies-house";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The key an address node is stored under: case, punctuation and spacing do not matter. */
export const normaliseAddress = squash;

const isDead = (x: { status: string }) =>
  x.status === "rejected" || x.status === "dead-end";

// ---------------------------------------------------------------- searching

export async function searchEntity(
  s: Sources,
  a: { query: string; jurisdiction: "uk" | "us" },
): Promise<{ hits: EntityHit[]; note?: string }> {
  const cutShort: string[] = [];
  const failed: string[] = [];
  const hits: EntityHit[] = [];

  if (a.jurisdiction === "uk") {
    const r = await s.ch.searchCompanies(a.query);
    for (const h of r.data) {
      hits.push({
        jurisdiction: "uk",
        source: CH,
        key: h.number,
        name: h.name,
        ...(h.status ? { status: h.status } : {}),
        ...(h.address ? { address: h.address } : {}),
        ...(h.type ? { detail: h.type } : {}),
      });
    }
    if (!r.complete && r.note) cutShort.push(r.note);
  } else {
    const [sec, gleif] = await Promise.allSettled([
      s.sec.findCompany(a.query),
      s.gleif.findByName(a.query),
    ]);
    const settle = <T>(
      name: string,
      out: PromiseSettledResult<SourceResult<T[]>>,
    ): SourceResult<T[]> | undefined => {
      if (out.status === "fulfilled") return out.value;
      if (!(out.reason instanceof SourceError)) throw out.reason;
      failed.push(`${name} could not be searched: ${out.reason.message}`);
      return undefined;
    };
    const secRes = settle("SEC", sec);
    const gleifRes = settle("GLEIF", gleif);
    if (!secRes && !gleifRes) {
      throw (sec as PromiseRejectedResult).reason as SourceError;
    }
    for (const f of secRes?.data ?? []) {
      hits.push({
        jurisdiction: "us",
        source: "sec",
        key: f.cik,
        name: f.name,
        ...(f.ticker ? { detail: `ticker ${f.ticker}` } : {}),
      });
    }
    for (const r of gleifRes?.data ?? []) {
      hits.push({
        jurisdiction: "us",
        source: "gleif",
        key: r.lei,
        name: r.name,
        status: r.status,
        detail: `LEI ${r.lei}${r.country ? `, ${r.country}` : ""}`,
      });
    }
    for (const r of [secRes, gleifRes]) {
      if (r && !r.complete && r.note) cutShort.push(r.note);
    }
  }

  // "no matches" is only said when every source was actually searched.
  if (hits.length === 0 && failed.length === 0) return { hits, note: "no matches" };
  const note = [...cutShort, ...failed].join("; ");
  return note ? { hits, note } : { hits };
}

// ---------------------------------------------------------------- one expansion

const SEVERITY: Record<CoverageState, number> = {
  not_available: 0,
  no_match: 1,
  searched: 2,
  not_read: 3,
  incomplete: 4,
};

interface RunInput {
  caseId: string;
  ownerEmail: string;
  actor: Actor;
  caller: string;
}

const nodeKey = (type: NodeType, key: string) => `${type}\u0000${key}`;
const edgeKey = (type: EdgeType, from: string, to: string) =>
  `${type}\u0000${from}\u0000${to}`;

const sameEvidence = (a: EvidenceRow, b: EvidenceInput) =>
  a.url === b.url &&
  a.recordId === b.recordId &&
  a.contentHash === b.contentHash &&
  (a.excerpt ?? "") === (b.excerpt ?? "");

/**
 * The state of one expansion: what is already on the board, what has been
 * pinned, what each source managed to read. Everything it pins is `proposed`
 * and carries the evidence it was given.
 */
function createRun(i: RunInput, board: { nodes: BoardNode[]; edges: BoardEdge[] }) {
  const nodes = new Map(board.nodes.map((n) => [nodeKey(n.type, n.key), n]));
  const edges = new Map(
    board.edges.map((e) => [edgeKey(e.type, e.fromId, e.toId), e]),
  );
  const skipped = new Set<string>();
  const coverage = new Map<string, { state: CoverageState; notes: string[] }>();
  const incomplete = new Set<string>();
  const stopped = new Set<string>();
  const failures: string[] = [];
  const notes: string[] = [];
  let pinnedNodes = 0;
  let pinnedEdges = 0;

  function mark(source: string, state: CoverageState, note: string) {
    const row = coverage.get(source) ?? { state, notes: [] };
    if (SEVERITY[state] > SEVERITY[row.state]) row.state = state;
    if (note) row.notes.push(note);
    coverage.set(source, row);
  }

  /** A plain statement for the agent and the coverage row. */
  function info(source: string, note: string, state: CoverageState = "searched") {
    mark(source, state, note);
    notes.push(note);
  }

  function cut(source: string, note: string) {
    mark(source, "incomplete", note);
    incomplete.add(source);
    notes.push(note);
  }

  function fail(source: string, state: "incomplete" | "not_read", message: string) {
    mark(source, state, message);
    incomplete.add(source);
    failures.push(`${source}: ${message}`);
    notes.push(message);
  }

  /**
   * Calls a source. A refusal, timeout, missing key or spent limit is recorded
   * against that source and the rest of the expansion carries on; once a
   * source has refused, it is not asked again in this expansion.
   */
  async function read<T>(
    source: string,
    part: string,
    call: () => Promise<SourceResult<T>>,
  ): Promise<SourceResult<T> | undefined> {
    if (stopped.has(source)) return undefined;
    try {
      return await call();
    } catch (e) {
      if (e instanceof CapError) {
        stopped.add(source);
        fail(source, "incomplete", `${part}: ${e.message}`);
        return undefined;
      }
      if (!(e instanceof SourceError)) throw e;
      switch (e.kind) {
        case "rate_limited":
        case "timeout":
          stopped.add(source);
          fail(source, "incomplete", `${part}: ${e.message}`);
          break;
        case "no_key":
          stopped.add(source);
          fail(source, "not_read", `${part}: ${e.message}`);
          break;
        case "bad_response":
          fail(source, "incomplete", `${part}: ${e.message}`);
          break;
        case "not_found":
          info(source, `${part}: not found at the source`);
          break;
      }
      return undefined;
    }
  }

  /** Records what a list read found, or that it was cut short. */
  function tally(
    source: string,
    part: string,
    r: SourceResult<unknown[]>,
  ) {
    const n = r.data.length;
    if (!r.complete) {
      cut(source, `${part}: ${r.note ?? "list cut short"}`);
    } else {
      mark(source, n > 0 ? "searched" : "no_match", `${part}: ${n > 0 ? `${n} read` : "none listed"}`);
    }
  }

  async function node(spec: {
    type: NodeType;
    key: string;
    label: string;
    facts: Record<string, string>;
    evidence: EvidenceInput;
  }): Promise<BoardNode | undefined> {
    const k = nodeKey(spec.type, spec.key);
    const existing = nodes.get(k);
    if (existing) {
      if (isDead(existing)) {
        skipped.add(existing.id);
        return undefined;
      }
      if (existing.evidence.some((e) => sameEvidence(e, spec.evidence))) return existing;
    }
    const pinned = await pinNode({
      caseId: i.caseId,
      ownerEmail: i.ownerEmail,
      type: spec.type,
      key: spec.key,
      label: spec.label,
      facts: spec.facts,
      evidence: [spec.evidence],
      actor: i.actor,
      status: "proposed",
    });
    nodes.set(k, pinned);
    if (!existing) pinnedNodes += 1;
    return pinned;
  }

  async function edge(spec: {
    type: EdgeType;
    from: BoardNode | undefined;
    to: BoardNode | undefined;
    evidence: EvidenceInput;
  }): Promise<void> {
    // An end that was skipped (a rejected lead) takes its links with it.
    if (!spec.from || !spec.to) return;
    const k = edgeKey(spec.type, spec.from.id, spec.to.id);
    const existing = edges.get(k);
    if (existing) {
      if (isDead(existing)) {
        skipped.add(existing.id);
        return;
      }
      if (existing.evidence.some((e) => sameEvidence(e, spec.evidence))) return;
    }
    const pinned = await pinEdge({
      caseId: i.caseId,
      ownerEmail: i.ownerEmail,
      type: spec.type,
      fromId: spec.from.id,
      toId: spec.to.id,
      evidence: [spec.evidence],
      actor: i.actor,
    });
    edges.set(k, pinned);
    if (!existing) pinnedEdges += 1;
  }

  /** Writes the coverage rows, logs anything that went wrong, and reports. */
  async function finish(subject: BoardNode): Promise<ExpandResult> {
    for (const [source, row] of coverage) {
      await setCoverage(i.caseId, i.ownerEmail, {
        source,
        state: row.state,
        note: row.notes.join("; "),
      });
    }
    if (failures.length > 0) {
      await logActivity({
        caseId: i.caseId,
        ownerEmail: i.ownerEmail,
        actor: i.actor,
        caller: i.caller,
        kind: "expand-incomplete",
        targetId: subject.id,
        detail: failures.join("; "),
      });
    }
    return {
      pinnedNodes,
      pinnedEdges,
      incomplete: [...incomplete],
      skippedDeadEnds: skipped.size,
      notes,
    };
  }

  return { mark, info, cut, read, tally, node, edge, finish };
}

type Run = ReturnType<typeof createRun>;

async function start(a: {
  caseId: string;
  ownerEmail: string;
  nodeId: string;
  actor: Actor;
  caller?: string;
}) {
  const board = await listBoard(a.caseId, a.ownerEmail);
  const subject = board.nodes.find((n) => n.id === a.nodeId);
  if (!subject) throw new StoreError("node_not_found");
  const run = createRun(
    {
      caseId: a.caseId,
      ownerEmail: a.ownerEmail,
      actor: a.actor,
      caller: a.caller ?? (a.actor === "person" ? "frontend" : "tool"),
    },
    board,
  );
  return { subject, run };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const span = (from?: string, to?: string) =>
  [from ? `appointed ${from}` : "", to ? `resigned ${to}` : ""]
    .filter(Boolean)
    .join(", ");

// ---------------------------------------------------------------- companies

export async function expandCompany(
  s: Sources,
  a: {
    caseId: string;
    ownerEmail: string;
    nodeId: string;
    actor: Actor;
    caller?: string;
    include?: ExpandPart[];
  },
): Promise<ExpandResult> {
  const { subject, run } = await start(a);
  if (subject.type !== "company") {
    throw new ExpandError("bad_node", "Only a company can be expanded this way.");
  }
  const jurisdiction = subject.facts.jurisdiction;
  if (jurisdiction === "uk") {
    await expandUk(s, run, subject, new Set(a.include ?? ["officers", "controllers", "address"]));
  } else if (jurisdiction === "us") {
    await expandUs(s, run, subject, new Set(a.include ?? ["filings", "leaks"]));
  } else {
    throw new ExpandError("bad_node", "This company has no register that can be read from here.");
  }
  return run.finish(subject);
}

async function expandUk(
  s: Sources,
  run: Run,
  subject: BoardNode,
  include: Set<ExpandPart>,
): Promise<void> {
  const key = subject.key;
  let profileRead: Promise<SourceResult<CompanyProfile> | undefined> | undefined;
  const profile = () =>
    (profileRead ??= run.read(CH, "company profile", () => s.ch.getCompany(key)));

  if (include.has("officers")) {
    const r = await run.read(CH, "officers", () => s.ch.getOfficers(key, { cap: OFFICER_CAP }));
    if (r) {
      run.tally(CH, "officers", r);
      for (const o of r.data) {
        const born = o.birth ? `born ${pad2(o.birth.month)}/${o.birth.year}` : "";
        const evidence: EvidenceInput = {
          ...r.evidence,
          recordId: o.officerId,
          excerpt: [o.role, span(o.appointedOn, o.resignedOn), born, o.nationality ?? ""]
            .filter(Boolean)
            .join(", "),
        };
        const who = await run.node({
          // A company can hold an office too; it is not a person.
          type: o.corporate ? "company" : "person",
          key: o.corporate ? `officer:${o.officerId}` : o.officerId,
          label: o.name,
          facts: {
            role: o.role,
            ...(o.appointedOn ? { appointed: o.appointedOn } : {}),
            ...(o.resignedOn ? { resigned: o.resignedOn } : {}),
            ...(o.nationality ? { nationality: o.nationality } : {}),
          },
          evidence,
        });
        await run.edge({
          type: o.role.startsWith("llp-") ? "member-of" : "officer-of",
          from: who,
          to: subject,
          evidence,
        });
      }
      if (r.data.length === 0) {
        const type = subject.facts.type || (await profile())?.data.type;
        if (type === "limited-partnership") {
          run.info("companies-house-partners", PARTNER_NOTE, "not_read");
        }
      }
    }
  }

  if (include.has("controllers")) {
    const r = await run.read(CH, "controllers", () => s.ch.getControllers(key));
    if (r) {
      run.tally(CH, "controllers", r);
      let hidden = 0;
      for (const c of r.data) {
        if (c.kind.includes("super-secure")) {
          hidden += 1;
          continue;
        }
        const evidence: EvidenceInput = {
          ...r.evidence,
          recordId: c.id,
          excerpt: [c.natures.join(", "), c.notifiedOn ? `notified ${c.notifiedOn}` : "", c.ceasedOn ? `ceased ${c.ceasedOn}` : ""]
            .filter(Boolean)
            .join("; "),
        };
        const who = await run.node({
          type: c.kind.startsWith("individual") ? "person" : "company",
          // The register gives a controller no id that spans companies, so the
          // key is scoped to this company and never merges people by name.
          key: `psc:${key}:${c.id}`,
          label: c.name,
          facts: {
            kind: c.kind,
            natures: c.natures.join(", "),
            ...(c.notifiedOn ? { notified: c.notifiedOn } : {}),
            ...(c.ceasedOn ? { ceased: c.ceasedOn } : {}),
          },
          evidence,
        });
        await run.edge({ type: "controls", from: who, to: subject, evidence });
      }
      if (hidden > 0) {
        run.info(
          CH,
          `controllers: ${hidden} super-secure controller${hidden === 1 ? " is" : "s are"} hidden by the register`,
        );
      }
    }
  }

  if (include.has("address")) {
    const p = await profile();
    if (p?.data.address) {
      const evidence: EvidenceInput = {
        ...p.evidence,
        excerpt: `Registered office: ${p.data.address}`,
      };
      const where = await run.node({
        type: "address",
        key: normaliseAddress(p.data.address),
        label: p.data.address,
        facts: {},
        evidence,
      });
      await run.edge({ type: "registered-at", from: subject, to: where, evidence });
      run.mark(CH, "searched", "address: read");
    }
  }

  if (include.has("filings")) {
    const r = await run.read(CH, "filings", () => s.ch.getFilings(key, { cap: FILING_CAP }));
    if (r) {
      run.tally(CH, "filings", r);
      for (const f of r.data) {
        await run.node({
          type: "document",
          key: f.transactionId,
          label: `${f.type} ${f.date}`.trim(),
          facts: {
            date: f.date,
            category: f.category,
            type: f.type,
            description: f.description,
            company: key,
          },
          evidence: { ...r.evidence, recordId: f.transactionId, excerpt: f.description },
        });
      }
    }
  }

  if (include.has("leaks")) await leaks(s, run, subject);

  if (include.has("neighbours")) {
    const address = subject.facts.address || (await profile())?.data.address;
    if (!address) {
      run.info(CH, "neighbours: no registered address is known to search near");
    } else {
      const r = await run.read(CH, "neighbours", () =>
        s.ch.searchByLocation(address, { cap: NEIGHBOUR_CAP }),
      );
      if (r) {
        run.tally(CH, "neighbours", r);
        const want = normaliseAddress(address);
        let other = 0;
        for (const h of r.data) {
          if (h.number === key) continue;
          // A search near an address also returns nearby addresses; only the
          // ones whose text agrees are called "same address".
          const have = normaliseAddress(h.address ?? "");
          if (!have || !(have.includes(want) || want.includes(have))) {
            other += 1;
            continue;
          }
          const evidence: EvidenceInput = {
            ...r.evidence,
            recordId: h.number,
            excerpt: `${h.name} (${h.number}): ${h.address}`,
          };
          const neighbour = await run.node({
            type: "company",
            key: h.number,
            label: h.name,
            facts: {
              jurisdiction: "uk",
              ...(h.status ? { status: h.status } : {}),
              ...(h.type ? { type: h.type } : {}),
              ...(h.address ? { address: h.address } : {}),
            },
            evidence,
          });
          await run.edge({ type: "same-address", from: subject, to: neighbour, evidence });
        }
        if (other > 0) {
          run.info(
            CH,
            `neighbours: ${other} other ${other === 1 ? "company" : "companies"} near this address ${other === 1 ? "was" : "were"} not pinned (the address differs)`,
          );
        }
      }
    }
  }
}

async function expandUs(
  s: Sources,
  run: Run,
  subject: BoardNode,
  include: Set<ExpandPart>,
): Promise<void> {
  run.mark("us-register", "not_available", US_NOTE);

  if (include.has("filings")) {
    const r = await run.read("sec", "filings", () =>
      s.sec.recentFilings(subject.key, { cap: US_FILING_CAP }),
    );
    if (r) {
      run.tally("sec", "filings", r);
      for (const f of r.data) {
        await run.node({
          type: "document",
          key: f.accession,
          label: `${f.form} ${f.date}`.trim(),
          facts: {
            form: f.form,
            date: f.date,
            description: f.description,
            link: f.url,
            company: subject.key,
          },
          evidence: { ...r.evidence, recordId: f.accession, excerpt: f.description },
        });
      }
    }
  }

  // GLEIF parent links: only for a record whose name is exactly this company's.
  const found = await run.read("gleif", "LEI search", () => s.gleif.findByName(subject.label));
  if (found) {
    const mine = found.data
      .filter((r) => squash(r.name) === squash(subject.label))
      .slice(0, 3);
    if (mine.length === 0) {
      run.mark("gleif", "no_match", "no LEI record with this exact name");
    } else {
      let links = 0;
      for (const rec of mine) {
        for (const kind of rec.parents) {
          const p = await run.read("gleif", `${kind} parent`, () => s.gleif.getParent(rec.lei, kind));
          const parent = p?.data;
          if (!p || !parent) continue;
          const evidence: EvidenceInput = {
            ...p.evidence,
            excerpt: `GLEIF reports ${parent.name} as the ${kind} parent of ${rec.name}`,
          };
          const above = await run.node({
            type: "company",
            key: `lei:${parent.lei}`,
            label: parent.name,
            facts: {
              lei: parent.lei,
              status: parent.status,
              ...(parent.jurisdiction ? { legalJurisdiction: parent.jurisdiction } : {}),
              ...(parent.country ? { country: parent.country } : {}),
            },
            evidence,
          });
          await run.edge({ type: "controls", from: above, to: subject, evidence });
          links += 1;
        }
      }
      run.mark(
        "gleif",
        "searched",
        `${mine.length} LEI record${mine.length === 1 ? "" : "s"} matched by exact name; ${links} parent link${links === 1 ? "" : "s"}`,
      );
    }
  }

  if (include.has("leaks")) await leaks(s, run, subject);
}

/** Offshore Leaks name matches: candidates for a person to look at, never conclusions. */
async function leaks(s: Sources, run: Run, subject: BoardNode): Promise<void> {
  const r = await run.read("icij", "Offshore Leaks", () => s.icij.reconcile(subject.label));
  if (!r) return;
  if (r.data.length === 0) {
    run.mark("icij", "no_match", "no candidates for this name in Offshore Leaks");
    return;
  }
  const top = [...r.data].sort((x, y) => y.score - x.score).slice(0, ICIJ_CAP);
  for (const c of top) {
    const evidence: EvidenceInput = {
      source: "icij",
      url: c.url,
      recordId: c.id,
      retrievedAt: r.evidence.retrievedAt,
      contentHash: r.evidence.contentHash,
      excerpt: `Name match, score ${c.score}; a candidate, not a confirmed match. ${c.description}`.trim(),
    };
    const hit = await run.node({
      type: "document",
      key: `icij:${c.id}`,
      label: c.name,
      facts: {
        source: "ICIJ Offshore Leaks",
        description: c.description,
        score: String(c.score),
      },
      evidence,
    });
    await run.edge({ type: "candidate-match", from: hit, to: subject, evidence });
  }
  if (!r.complete || r.data.length > top.length) {
    run.cut("icij", `candidates: showing ${top.length} of ${r.data.length}`);
  } else {
    run.mark(
      "icij",
      "searched",
      `${top.length} candidate${top.length === 1 ? "" : "s"} matched by name; none confirmed`,
    );
  }
}

/** Offshore Leaks name check for any node (a company, a person, an address). */
export async function checkLeaks(
  s: Sources,
  a: {
    caseId: string;
    ownerEmail: string;
    nodeId: string;
    actor: Actor;
    caller?: string;
  },
): Promise<ExpandResult> {
  const { subject, run } = await start(a);
  await leaks(s, run, subject);
  return run.finish(subject);
}

// ---------------------------------------------------------------- officers

export async function expandOfficer(
  s: Sources,
  a: {
    caseId: string;
    ownerEmail: string;
    nodeId: string;
    actor: Actor;
    caller?: string;
  },
): Promise<ExpandResult> {
  const { subject, run } = await start(a);
  if (subject.type !== "person") {
    throw new ExpandError("bad_node", "Only a person can be expanded this way.");
  }
  if (subject.key.startsWith("psc:")) {
    throw new ExpandError(
      "bad_node",
      "The register gives this person no officer id, so their other appointments cannot be listed.",
    );
  }

  const r = await run.read(CH, "appointments", () =>
    s.ch.getAppointments(subject.key, { cap: OFFICER_CAP }),
  );
  if (r) {
    run.tally(CH, "appointments", r);
    for (const ap of r.data) {
      const evidence: EvidenceInput = {
        ...r.evidence,
        excerpt: [`${ap.role} of ${ap.companyName} (${ap.companyNumber})`, span(ap.appointedOn, ap.resignedOn)]
          .filter(Boolean)
          .join(", "),
      };
      const company = await run.node({
        type: "company",
        key: ap.companyNumber,
        label: ap.companyName,
        facts: {
          jurisdiction: "uk",
          ...(ap.companyStatus ? { status: ap.companyStatus } : {}),
        },
        evidence,
      });
      await run.edge({
        type: ap.role.startsWith("llp-") ? "member-of" : "officer-of",
        from: subject,
        to: company,
        evidence,
      });
    }
  }
  return run.finish(subject);
}
