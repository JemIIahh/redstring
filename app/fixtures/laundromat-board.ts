// SYNTHETIC SAMPLE DATA. Every company, person, address and number on this board
// is invented (company numbers use the unissued OC9xxxxx range). It exists so the
// case page can be built and shown without Companies House, and it deliberately
// pairs no invented person with a real company. The shape follows the Azerbaijani
// Laundromat reporting: a few UK shells sharing an address, a shared corporate
// officer, a shared director, an Offshore Leaks candidate, a hand-pinned row from
// a published table. The real records are read by the agent once the key exists.
import { computeObservations } from "../../server/board/observations";
import type {
  ActivityRow,
  Board,
  BoardEdge,
  BoardNode,
  EdgeType,
  EvidenceRow,
  NodeType,
  Observation,
  Status,
} from "../../server/board/types";

export const SAMPLE_CASE_ID = "sample";
export const SAMPLE_TITLE = "Quay Street shells";

const CASE = SAMPLE_CASE_ID;
const CH = "https://find-and-update.company-information.service.gov.uk";
const SEEN = "2026-11-02T09:00:00.000Z";
const ADDED = "2026-11-02T09:05:00.000Z";

let evidenceCount = 0;
const ev = (
  source: EvidenceRow["source"],
  url: string,
  recordId: string,
  excerpt?: string,
): EvidenceRow => ({
  id: `ev-${++evidenceCount}`,
  source,
  url,
  recordId,
  retrievedAt: SEEN,
  contentHash: `sample-${evidenceCount.toString(16).padStart(8, "0")}`,
  ...(excerpt ? { excerpt } : {}),
});

const profile = (n: string) => ev("companies-house", `${CH}/company/${n}`, n);
const officers = (n: string, id: string, excerpt: string) =>
  ev("companies-house", `${CH}/company/${n}/officers`, id, excerpt);
const controllers = (n: string, id: string, excerpt: string) =>
  ev("companies-house", `${CH}/company/${n}/persons-with-significant-control`, id, excerpt);

interface NodeSpec {
  id: string;
  type: NodeType;
  key: string;
  label: string;
  facts?: Record<string, string>;
  status: Status;
  reason?: string;
  addedBy: "person" | "agent";
  x: number;
  y: number;
  evidence: EvidenceRow[];
}

const node = (s: NodeSpec): BoardNode => ({
  id: s.id,
  caseId: CASE,
  type: s.type,
  key: s.key,
  label: s.label,
  facts: s.facts ?? {},
  status: s.status,
  ...(s.reason ? { reason: s.reason } : {}),
  addedBy: s.addedBy,
  x: s.x,
  y: s.y,
  evidence: s.evidence,
  createdAt: ADDED,
});

const company = (
  id: string,
  number: string,
  label: string,
  companyType: string,
  status: string,
  address: string,
) => ({
  id,
  type: "company" as const,
  key: number,
  label,
  facts: { jurisdiction: "uk", number, type: companyType, status, address },
  evidence: [profile(number)],
});

const QUAY = "Unit 3, Quay Street Mews, London, EC2V 0AA";

export const sampleNodes: BoardNode[] = [
  // Row 0: addresses and a few loose ends
  node({
    id: "psc1", type: "person", key: "psc:OC900101:PSC01", label: "WELD, Tomasz",
    facts: { role: "person with significant control" },
    status: "proposed", addedBy: "agent", x: 340, y: 30,
    evidence: [controllers("OC900101", "PSC01", "Holds 25 to 50 percent of the shares.")],
  }),
  node({
    id: "a1", type: "address", key: "unit 3 quay street mews london ec2v 0aa", label: QUAY,
    status: "proposed", addedBy: "agent", x: 620, y: 30,
    evidence: [ev("companies-house", `${CH}/company/OC900101`, "OC900101", "Registered office.")],
  }),
  node({
    ...company("c7", "OC900107", "CORNHILL DESK SERVICES LTD", "ltd", "active", QUAY),
    status: "proposed", addedBy: "agent", x: 900, y: 30,
  }),
  node({
    id: "d6", type: "document", key: "icij:SAMPLE2", label: "ICIJ candidate: TOLLAND ROW",
    facts: { score: "51", note: "A candidate, not a confirmed match." },
    status: "rejected", reason: "A different entity, registered in another country.",
    addedBy: "agent", x: 1180, y: 30,
    evidence: [ev("icij", "https://offshoreleaks.icij.org/nodes/SAMPLE2", "SAMPLE2", "A candidate, not a confirmed match.")],
  }),

  // Row 1: the three companies the case started from
  node({
    id: "d3", type: "document", key: "icij:SAMPLE1", label: "ICIJ candidate: HARLOW QUAY",
    facts: { score: "64", note: "A candidate, not a confirmed match." },
    status: "proposed", addedBy: "agent", x: 60, y: 250,
    evidence: [ev("icij", "https://offshoreleaks.icij.org/nodes/SAMPLE1", "SAMPLE1", "A candidate, not a confirmed match.")],
  }),
  node({
    ...company("c1", "OC900101", "HARLOW QUAY TRADING LLP", "llp", "active", QUAY),
    status: "confirmed", addedBy: "person", x: 340, y: 250,
  }),
  node({
    ...company("c2", "OC900102", "BRINDLE & MARSH HOLDINGS LLP", "llp", "active", QUAY),
    status: "confirmed", addedBy: "person", x: 620, y: 250,
  }),
  node({
    ...company("c3", "LP900103", "TOLLAND ROW SERVICES LP", "limited-partnership", "active", QUAY),
    status: "confirmed", addedBy: "person", x: 900, y: 250,
  }),
  node({
    id: "d4", type: "document", key: "occrp:occrp table, row 12", label: "OCCRP table, row 12: Tolland Row Services",
    status: "confirmed", addedBy: "person", x: 1180, y: 250,
    evidence: [{
      ...ev("occrp", "https://www.occrp.org/en/azerbaijanilaundromat", "table 2, row 12"),
      excerpt: "Pinned by hand.",
    }],
  }),

  // Row 2: officers and controllers
  node({
    id: "p1", type: "person", key: "ID_P1", label: "TEAGUE, Marian", facts: { role: "director" },
    status: "proposed", addedBy: "agent", x: 120, y: 430,
    evidence: [officers("OC900101", "ID_P1", "Director, appointed 2019-04-02.")],
  }),
  node({
    id: "p2", type: "person", key: "ID_P2", label: "KOTHARI, Dev", facts: { role: "llp-member" },
    status: "confirmed", addedBy: "agent", x: 400, y: 430,
    evidence: [
      officers("OC900101", "ID_P2", "Designated LLP member, appointed 2018-09-14."),
      officers("OC900102", "ID_P2", "Designated LLP member, appointed 2020-01-20."),
    ],
  }),
  node({
    id: "co1", type: "company", key: "officer:CO900001", label: "KESTREL NOMINEE SERVICES LTD",
    facts: { role: "corporate member" },
    status: "confirmed", addedBy: "agent", x: 680, y: 430,
    evidence: [
      officers("OC900101", "CO900001", "Corporate member, appointed 2018-09-14."),
      officers("OC900102", "CO900001", "Corporate member, appointed 2020-01-20."),
    ],
  }),
  node({
    id: "psc2", type: "company", key: "psc:LP900103:PSC02", label: "ALDER REACH HOLDINGS LTD",
    facts: { role: "legal person with significant control" },
    status: "proposed", addedBy: "agent", x: 960, y: 430,
    evidence: [controllers("LP900103", "PSC02", "Holds more than 75 percent of the voting rights.")],
  }),

  // Row 3: what the officers are also appointed to
  node({
    id: "p5", type: "person", key: "ID_P5", label: "TEAGUE, Marian", facts: { role: "director" },
    status: "rejected", reason: "Different person, same name: birth month and year differ.",
    addedBy: "agent", x: 120, y: 620,
    evidence: [officers("OC900104", "ID_P5", "Director, appointed 2014-06-30.")],
  }),
  node({
    ...company("c4", "OC900104", "SALTERN & VOSS LTD", "ltd", "active", "Castle Wharf, Unit 4, Birmingham, B1 0AA"),
    status: "proposed", addedBy: "agent", x: 400, y: 620,
  }),
  node({
    ...company("c5", "OC900105", "NORTH ARBOR SUPPLY LLP", "llp", "dissolved", "Floor 2, Old Mill Court, Leeds, LS2 0AA"),
    status: "dead-end", reason: "Dissolved in 2016; no filings after that.",
    addedBy: "agent", x: 680, y: 620,
  }),
  node({
    ...company("c6", "OC900106", "ASHGROVE MERIDIAN LTD", "ltd", "active", "Suite 9, Kingsway House, Leeds, LS1 0AA"),
    status: "proposed", addedBy: "agent", x: 960, y: 620,
  }),
  node({
    id: "p3", type: "person", key: "ID_P3", label: "BRENNAN, Isla", facts: { role: "director" },
    status: "proposed", addedBy: "agent", x: 1240, y: 620,
    evidence: [officers("OC900106", "ID_P3", "Director, appointed 2021-02-11.")],
  }),

  // Row 4: the far ends
  node({
    id: "p6", type: "person", key: "ID_P6", label: "LINDQVIST, Per", facts: { role: "director" },
    status: "proposed", addedBy: "agent", x: 120, y: 850,
    evidence: [officers("OC900104", "ID_P6", "Director, appointed 2017-03-08.")],
  }),
  node({
    id: "a2", type: "address", key: "castle wharf unit 4 birmingham b1 0aa", label: "Castle Wharf, Unit 4, Birmingham, B1 0AA",
    status: "proposed", addedBy: "agent", x: 400, y: 850,
    evidence: [ev("companies-house", `${CH}/company/OC900104`, "OC900104", "Registered office.")],
  }),
  node({
    id: "p7", type: "person", key: "ID_P7", label: "HALVORSEN, Ingrid", facts: { role: "director" },
    status: "proposed", addedBy: "agent", x: 680, y: 850,
    evidence: [officers("OC900105", "ID_P7", "Director, appointed 2012-10-01, resigned 2016-05-12.")],
  }),
  node({
    id: "a3", type: "address", key: "suite 9 kingsway house leeds ls1 0aa", label: "Suite 9, Kingsway House, Leeds, LS1 0AA",
    status: "proposed", addedBy: "agent", x: 960, y: 850,
    evidence: [ev("companies-house", `${CH}/company/OC900106`, "OC900106", "Registered office.")],
  }),
];

interface EdgeSpec {
  type: EdgeType;
  from: string;
  to: string;
  status: Status;
  reason?: string;
  addedBy?: "person" | "agent";
  evidence: EvidenceRow;
}

const edge = (n: number, s: EdgeSpec): BoardEdge => ({
  id: `e${n}`,
  caseId: CASE,
  type: s.type,
  fromId: s.from,
  toId: s.to,
  status: s.status,
  ...(s.reason ? { reason: s.reason } : {}),
  addedBy: s.addedBy ?? "agent",
  evidence: [s.evidence],
});

const office = (n: string) => ev("companies-house", `${CH}/company/${n}`, n, "Registered office.");

export const sampleEdges: BoardEdge[] = [
  edge(1, { type: "registered-at", from: "c1", to: "a1", status: "confirmed", evidence: office("OC900101") }),
  edge(2, { type: "registered-at", from: "c2", to: "a1", status: "confirmed", evidence: office("OC900102") }),
  edge(3, { type: "registered-at", from: "c3", to: "a1", status: "proposed", evidence: office("LP900103") }),
  edge(4, { type: "registered-at", from: "c7", to: "a1", status: "proposed", evidence: office("OC900107") }),
  edge(5, { type: "registered-at", from: "c4", to: "a2", status: "proposed", evidence: office("OC900104") }),
  edge(6, { type: "registered-at", from: "c6", to: "a3", status: "proposed", evidence: office("OC900106") }),
  edge(7, { type: "officer-of", from: "p1", to: "c1", status: "proposed", evidence: officers("OC900101", "ID_P1", "Director.") }),
  edge(8, { type: "member-of", from: "p2", to: "c1", status: "confirmed", evidence: officers("OC900101", "ID_P2", "Designated LLP member.") }),
  edge(9, { type: "member-of", from: "p2", to: "c2", status: "confirmed", evidence: officers("OC900102", "ID_P2", "Designated LLP member.") }),
  edge(10, { type: "member-of", from: "co1", to: "c1", status: "confirmed", evidence: officers("OC900101", "CO900001", "Corporate member.") }),
  edge(11, { type: "member-of", from: "co1", to: "c2", status: "confirmed", evidence: officers("OC900102", "CO900001", "Corporate member.") }),
  edge(12, { type: "officer-of", from: "co1", to: "c6", status: "proposed", evidence: officers("OC900106", "CO900001", "Corporate director.") }),
  edge(13, { type: "officer-of", from: "p2", to: "c4", status: "proposed", evidence: officers("OC900104", "ID_P2", "Director.") }),
  edge(14, {
    type: "officer-of", from: "p2", to: "c5", status: "dead-end",
    reason: "The company was dissolved in 2016.", evidence: officers("OC900105", "ID_P2", "Director until 2016-05-12."),
  }),
  edge(15, {
    type: "officer-of", from: "p5", to: "c4", status: "rejected",
    reason: "A different person with the same name.", evidence: officers("OC900104", "ID_P5", "Director."),
  }),
  edge(16, { type: "officer-of", from: "p6", to: "c4", status: "proposed", evidence: officers("OC900104", "ID_P6", "Director.") }),
  edge(17, { type: "officer-of", from: "p7", to: "c5", status: "proposed", evidence: officers("OC900105", "ID_P7", "Director.") }),
  edge(18, { type: "officer-of", from: "p3", to: "c6", status: "proposed", evidence: officers("OC900106", "ID_P3", "Director.") }),
  edge(19, { type: "controls", from: "psc1", to: "c1", status: "proposed", evidence: controllers("OC900101", "PSC01", "25 to 50 percent of the shares.") }),
  edge(20, { type: "controls", from: "psc2", to: "c3", status: "proposed", evidence: controllers("LP900103", "PSC02", "More than 75 percent of the voting rights.") }),
  edge(21, {
    type: "candidate-match", from: "c1", to: "d3", status: "proposed",
    evidence: ev("icij", "https://offshoreleaks.icij.org/nodes/SAMPLE1", "SAMPLE1", "A candidate, not a confirmed match."),
  }),
  edge(22, {
    type: "candidate-match", from: "c3", to: "d6", status: "rejected",
    reason: "A different entity, registered in another country.",
    evidence: ev("icij", "https://offshoreleaks.icij.org/nodes/SAMPLE2", "SAMPLE2", "A candidate, not a confirmed match."),
  }),
];

const act = (
  n: number,
  at: string,
  actor: "person" | "agent",
  caller: string,
  kind: string,
  detail: string,
  targetId?: string,
): ActivityRow => ({
  id: `act${n}`,
  caseId: CASE,
  actor,
  caller,
  kind,
  at,
  detail,
  ...(targetId ? { targetId } : {}),
});

export const sampleActivity: ActivityRow[] = [
  act(1, "2026-11-02T09:00:00.000Z", "person", "frontend", "create-case", "3 starting companies: HARLOW QUAY TRADING LLP, BRINDLE & MARSH HOLDINGS LLP, TOLLAND ROW SERVICES LP"),
  act(2, "2026-11-02T09:02:00.000Z", "agent", "tool", "expand", "9 items and 11 links proposed", "c1"),
  act(3, "2026-11-02T09:03:00.000Z", "agent", "tool", "expand", "5 items and 6 links proposed; not fully read: companies-house-partners", "c3"),
  act(4, "2026-11-02T09:05:00.000Z", "agent", "tool", "check-leaks", "1 candidate found, none confirmed", "c1"),
  act(5, "2026-11-02T09:11:00.000Z", "person", "frontend", "set-status", "confirmed", "p2"),
  act(6, "2026-11-02T09:12:00.000Z", "person", "frontend", "set-status", "confirmed", "co1"),
  act(7, "2026-11-02T09:14:00.000Z", "person", "frontend", "set-status", "rejected: Different person, same name: birth month and year differ.", "p5"),
  act(8, "2026-11-02T09:15:00.000Z", "person", "frontend", "set-status", "dead-end: Dissolved in 2016; no filings after that.", "c5"),
  act(9, "2026-11-02T09:16:00.000Z", "person", "frontend", "pin-item", "OCCRP table, row 12: Tolland Row Services", "d4"),
  act(10, "2026-11-02T09:20:00.000Z", "agent", "tool", "suggest-reject", "The candidate's registered country differs from this company's.", "d3"),
];

const base: Board = {
  nodes: sampleNodes,
  edges: sampleEdges,
  activity: sampleActivity,
  coverage: [
    { source: "companies-house", state: "searched", note: "Officers, controllers and registered address read for 7 companies." },
    { source: "companies-house-partners", state: "not_read", note: "TOLLAND ROW SERVICES LP lists its partners only in scanned filings, which are not read." },
    { source: "icij", state: "searched", note: "2 candidates. Neither is confirmed." },
    { source: "gleif", state: "no_match", note: "No LEI record with this exact name." },
  ],
  suggestions: [
    {
      id: "s1",
      targetId: "d3",
      reason: "The candidate's registered country differs from this company's.",
      status: "open",
    },
  ],
  changes: [
    {
      id: "ch1",
      caseId: CASE,
      watchId: "w1",
      kind: "filings",
      summary: "1 new filing",
      status: "pending",
      createdAt: "2026-11-03T08:00:00.000Z",
    },
  ],
};

export const sampleBoard: Board & { caseId: string; title: string; observations: Observation[] } = {
  ...base,
  caseId: SAMPLE_CASE_ID,
  title: SAMPLE_TITLE,
  observations: computeObservations(base),
};
