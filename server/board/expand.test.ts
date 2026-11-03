import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "../db/test-db.js";
import type {
  Appointment,
  ChClient,
  CompanyProfile,
  Controller,
  Filing,
  Officer,
} from "../sources/companies-house.js";
import type { GleifClient, LeiRecord } from "../sources/gleif.js";
import type { IcijCandidate, IcijClient } from "../sources/icij.js";
import type { Sources } from "../sources/registry.js";
import type { SecClient, SecFiling } from "../sources/sec.js";
import { SourceError, type SourceResult } from "../sources/types.js";
import { CapError } from "../usage/caps.js";
import {
  ExpandError,
  checkLeaks,
  expandCompany,
  expandOfficer,
  searchEntity,
} from "./expand.js";
import { computeObservations } from "./observations.js";
import {
  createCase,
  listBoard,
  pinNode,
  setStatus,
  StoreError,
} from "./store.js";
import type { EvidenceInput, EvidenceSource } from "./types.js";

let client: TestDb["client"];
let testDb: TestDb["testDb"];

vi.mock("../db/index.js", () => ({
  getDb: () => testDb,
}));

const ALICE = "alice@example.com";
const BOB = "bob@example.com";
const CH = "https://find-and-update.company-information.service.gov.uk";
const NOW = "2026-11-03T10:00:00.000Z";
const PARTNER_NOTE =
  "Partners are not in the register data; they may be in scanned filings, which are not read.";
const US_NOTE = "The US has no public officer or owner register.";

const ev = (
  source: EvidenceSource,
  recordId: string,
  url: string,
): EvidenceInput => ({
  source,
  url,
  recordId,
  retrievedAt: NOW,
  contentHash: `hash-${recordId}`,
});

function res<T>(
  data: T,
  evidence: EvidenceInput,
  extra: { complete?: boolean; note?: string } = {},
): SourceResult<T> {
  return {
    data,
    evidence,
    complete: extra.complete ?? true,
    ...(extra.note ? { note: extra.note } : {}),
  };
}

const unexpected = (name: string) => async () => {
  throw new Error(`${name} should not have been called`);
};

function sources(
  over: {
    ch?: Partial<ChClient>;
    icij?: Partial<IcijClient>;
    gleif?: Partial<GleifClient>;
    sec?: Partial<SecClient>;
  } = {},
): Sources {
  return {
    ch: {
      searchCompanies: unexpected("ch.searchCompanies"),
      getCompany: unexpected("ch.getCompany"),
      getOfficers: unexpected("ch.getOfficers"),
      getControllers: unexpected("ch.getControllers"),
      getFilings: unexpected("ch.getFilings"),
      getAppointments: unexpected("ch.getAppointments"),
      searchByLocation: unexpected("ch.searchByLocation"),
      ...over.ch,
    },
    icij: { reconcile: unexpected("icij.reconcile"), ...over.icij },
    gleif: {
      findByName: unexpected("gleif.findByName"),
      getParent: unexpected("gleif.getParent"),
      ...over.gleif,
    },
    sec: {
      findCompany: unexpected("sec.findCompany"),
      recentFilings: unexpected("sec.recentFilings"),
      ...over.sec,
    },
  } as Sources;
}

const officer = (id: string, name: string, over: Partial<Officer> = {}): Officer => ({
  officerId: id,
  name,
  role: "director",
  corporate: false,
  ...over,
});

const officersEv = (n = "OC000001") => ev("companies-house", n, `${CH}/company/${n}/officers`);

async function ukCase(
  over: { type?: string; key?: string; label?: string; address?: string } = {},
) {
  const c = await createCase(ALICE, "Test case");
  const key = over.key ?? "OC000001";
  const company = await pinNode({
    caseId: c.id,
    ownerEmail: ALICE,
    type: "company",
    key,
    label: over.label ?? "ACME LLP",
    facts: {
      jurisdiction: "uk",
      type: over.type ?? "llp",
      ...(over.address ? { address: over.address } : {}),
    },
    evidence: [ev("companies-house", key, `${CH}/company/${key}`)],
    actor: "person",
    status: "confirmed",
  });
  return { c, company };
}

const args = (
  c: { id: string },
  company: { id: string },
  extra: Record<string, unknown> = {},
) => ({
  caseId: c.id,
  ownerEmail: ALICE,
  nodeId: company.id,
  actor: "agent" as const,
  ...extra,
});

beforeEach(async () => {
  ({ client, testDb } = await createTestDb());
});

afterEach(async () => {
  await client.close();
});

describe("searchEntity", () => {
  it("with zero hits returns a note and pins nothing", async () => {
    const { c } = await ukCase();
    const out = await searchEntity(
      sources({
        ch: {
          searchCompanies: async () =>
            res([], ev("companies-house", "search:nothing", `${CH}/search/companies?q=nothing`)),
        },
      }),
      { query: "nothing", jurisdiction: "uk" },
    );

    expect(out).toEqual({ hits: [], note: "no matches" });
    expect((await listBoard(c.id, ALICE)).nodes).toHaveLength(1);
  });

  it("returns UK hits keyed by company number", async () => {
    const out = await searchEntity(
      sources({
        ch: {
          searchCompanies: async () =>
            res(
              [
                {
                  number: "OC372263",
                  name: "LCM ALLIANCE LLP",
                  status: "dissolved",
                  type: "llp",
                  address: "Potters Bar",
                },
              ],
              ev("companies-house", "search:lcm", `${CH}/search/companies?q=lcm`),
            ),
        },
      }),
      { query: "lcm", jurisdiction: "uk" },
    );

    expect(out.hits).toEqual([
      {
        jurisdiction: "uk",
        source: "companies-house",
        key: "OC372263",
        name: "LCM ALLIANCE LLP",
        status: "dissolved",
        address: "Potters Bar",
        detail: "llp",
      },
    ]);
    expect(out.note).toBeUndefined();
  });

  it("passes on a cut-short note", async () => {
    const out = await searchEntity(
      sources({
        ch: {
          searchCompanies: async () =>
            res([{ number: "1", name: "A" }], ev("companies-house", "s", `${CH}/s`), {
              complete: false,
              note: "showing 1 of 3412",
            }),
        },
      }),
      { query: "a", jurisdiction: "uk" },
    );
    expect(out.note).toBe("showing 1 of 3412");
  });

  it("US search merges SEC and GLEIF hits and labels each source", async () => {
    const out = await searchEntity(
      sources({
        sec: {
          findCompany: async () =>
            res(
              [{ cik: "0001234567", name: "EXAMPLE HOLDINGS INC", ticker: "EXH" }],
              ev("sec", "search:example", "https://www.sec.gov/files/company_tickers.json"),
            ),
        },
        gleif: {
          findByName: async () =>
            res(
              [lei("LEI0000000000000001", "EXAMPLE HOLDINGS INC", { country: "US" })],
              ev("gleif", "search:example", "https://search.gleif.org/"),
            ),
        },
      }),
      { query: "example", jurisdiction: "us" },
    );

    expect(out.hits.map((h) => [h.source, h.key])).toEqual([
      ["sec", "0001234567"],
      ["gleif", "LEI0000000000000001"],
    ]);
    expect(out.hits[0]).toMatchObject({ jurisdiction: "us", detail: "ticker EXH" });
  });

  it("a US source that cannot be searched is reported, never read as 'no matches'", async () => {
    const out = await searchEntity(
      sources({
        sec: {
          findCompany: async () => {
            throw new SourceError("sec", "no_key", "No SEC contact is configured.");
          },
        },
        gleif: {
          findByName: async () =>
            res([], ev("gleif", "search:x", "https://search.gleif.org/")),
        },
      }),
      { query: "x", jurisdiction: "us" },
    );

    expect(out.hits).toEqual([]);
    expect(out.note).toContain("No SEC contact is configured.");
    expect(out.note).not.toContain("no matches");
  });

  it("throws when every US source failed", async () => {
    const fail = async () => {
      throw new SourceError("sec", "timeout");
    };
    await expect(
      searchEntity(
        sources({ sec: { findCompany: fail }, gleif: { findByName: fail } }),
        { query: "x", jurisdiction: "us" },
      ),
    ).rejects.toBeInstanceOf(SourceError);
  });
});

describe("expandCompany (UK)", () => {
  it("pins officers as proposed with evidence", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () =>
          res(
            [
              officer("ID_A", "SMITH, John", {
                appointedOn: "2014-01-01",
                birth: { month: 3, year: 1970 },
              }),
              officer("ID_B", "JONES, Ann", { role: "llp-member" }),
            ],
            officersEv(),
          ),
      },
    });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out).toMatchObject({
      pinnedNodes: 2,
      pinnedEdges: 2,
      incomplete: [],
      skippedDeadEnds: 0,
    });
    const board = await listBoard(c.id, ALICE);
    const a = board.nodes.find((n) => n.key === "ID_A")!;
    expect(a).toMatchObject({
      type: "person",
      label: "SMITH, John",
      status: "proposed",
      addedBy: "agent",
    });
    expect(a.evidence[0]).toMatchObject({
      source: "companies-house",
      recordId: "ID_A",
      url: `${CH}/company/OC000001/officers`,
      retrievedAt: NOW,
      contentHash: "hash-OC000001",
    });
    // Month and year of birth live in the evidence, never in the card facts.
    expect(a.evidence[0]!.excerpt).toContain("born 03/1970");
    expect(JSON.stringify(a.facts)).not.toContain("1970");

    const edgeFor = (key: string) =>
      board.edges.find((e) => e.fromId === board.nodes.find((n) => n.key === key)!.id)!;
    expect(edgeFor("ID_A")).toMatchObject({
      type: "officer-of",
      toId: company.id,
      status: "proposed",
      addedBy: "agent",
    });
    expect(edgeFor("ID_B").type).toBe("member-of");
    expect(edgeFor("ID_A").evidence).toHaveLength(1);
  });

  it("two officers named identically become two nodes keyed by officer id", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () =>
          res(
            [
              officer("ID_A", "SMITH, John", { birth: { month: 3, year: 1970 } }),
              officer("ID_B", "SMITH, John", { birth: { month: 11, year: 1985 } }),
            ],
            officersEv(),
          ),
      },
    });

    await expandCompany(s, args(c, company, { include: ["officers"] }));

    const people = (await listBoard(c.id, ALICE)).nodes.filter((n) => n.type === "person");
    expect(people.map((p) => p.key).sort()).toEqual(["ID_A", "ID_B"]);
    expect(people.map((p) => p.label)).toEqual(["SMITH, John", "SMITH, John"]);
  });

  it("pins a corporate officer as a company, not a person", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () =>
          res([officer("ID_C", "HOLDCO SERVICES LTD", { corporate: true })], officersEv()),
      },
    });

    await expandCompany(s, args(c, company, { include: ["officers"] }));

    const n = (await listBoard(c.id, ALICE)).nodes.find((x) => x.key === "officer:ID_C")!;
    expect(n.type).toBe("company");
  });

  it("a rejected officer is skipped and counted", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: { getOfficers: async () => res([officer("ID_A", "SMITH, John")], officersEv()) },
    });
    await expandCompany(s, args(c, company, { include: ["officers"] }));
    const person = (await listBoard(c.id, ALICE)).nodes.find((n) => n.key === "ID_A")!;
    await setStatus({
      caseId: c.id,
      ownerEmail: ALICE,
      targetKind: "node",
      targetId: person.id,
      to: "rejected",
      reason: "different person",
      actor: "person",
    });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out).toMatchObject({ pinnedNodes: 0, pinnedEdges: 0, skippedDeadEnds: 1 });
    const after = (await listBoard(c.id, ALICE)).nodes.find((n) => n.key === "ID_A")!;
    expect(after.status).toBe("rejected");
    expect(after.evidence).toHaveLength(1);
  });

  it("expanding twice adds nothing the second time", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: { getOfficers: async () => res([officer("ID_A", "SMITH, John")], officersEv()) },
    });
    await expandCompany(s, args(c, company, { include: ["officers"] }));

    const again = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(again).toMatchObject({ pinnedNodes: 0, pinnedEdges: 0 });
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.find((n) => n.key === "ID_A")!.evidence).toHaveLength(1);
    expect(board.edges[0]!.evidence).toHaveLength(1);
  });

  it("keeps both roles when one person holds two on the same company", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () =>
          res(
            [
              officer("ID_A", "SMITH, John", { role: "director" }),
              officer("ID_A", "SMITH, John", { role: "secretary" }),
            ],
            officersEv(),
          ),
      },
    });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out.pinnedNodes).toBe(1);
    const a = (await listBoard(c.id, ALICE)).nodes.find((n) => n.key === "ID_A")!;
    expect(a.evidence.map((e) => e.excerpt).join(" ")).toMatch(/director.*secretary/);
  });

  it("rate_limited mid-expansion keeps the first pins, lists the source under incomplete and sets coverage incomplete", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () => res([officer("ID_A", "SMITH, John")], officersEv()),
        getControllers: async () => {
          throw new SourceError(
            "companies-house",
            "rate_limited",
            "Companies House says too many requests.",
          );
        },
      },
    });

    const out = await expandCompany(
      s,
      args(c, company, { include: ["officers", "controllers"] }),
    );

    expect(out.pinnedNodes).toBe(1);
    expect(out.incomplete).toEqual(["companies-house"]);
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.some((n) => n.key === "ID_A")).toBe(true);
    const row = board.coverage.find((r) => r.source === "companies-house")!;
    expect(row.state).toBe("incomplete");
    expect(row.note).toContain("controllers");
    expect(row.note).toContain("too many requests");
    expect(board.activity.find((a) => a.kind === "expand-incomplete")).toMatchObject({
      actor: "agent",
      targetId: company.id,
    });
  });

  it("stops asking a source once it has refused, and still reads the others", async () => {
    const { c, company } = await ukCase();
    const getControllers = vi.fn(async () => res<Controller[]>([], officersEv()));
    const s = sources({
      ch: {
        getOfficers: async () => {
          throw new SourceError("companies-house", "timeout");
        },
        getControllers,
      },
      icij: { reconcile: async () => res<IcijCandidate[]>([], ev("icij", "q", "https://offshoreleaks.icij.org/")) },
    });

    const out = await expandCompany(
      s,
      args(c, company, { include: ["officers", "controllers", "leaks"] }),
    );

    expect(getControllers).not.toHaveBeenCalled();
    expect(out.incomplete).toEqual(["companies-house"]);
    const board = await listBoard(c.id, ALICE);
    expect(board.coverage.find((r) => r.source === "icij")?.state).toBe("no_match");
  });

  it("a spent daily limit is reported as incomplete, not thrown", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      ch: {
        getOfficers: async () => {
          throw new CapError("ch-call");
        },
      },
    });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out.incomplete).toEqual(["companies-house"]);
    const row = (await listBoard(c.id, ALICE)).coverage.find(
      (r) => r.source === "companies-house",
    )!;
    expect(row.note).toContain("Daily limit reached");
  });

  it('a company with 200 officers pins 50 and reports "showing 50 of 200"', async () => {
    const { c, company } = await ukCase();
    const fifty = Array.from({ length: 50 }, (_, i) => officer(`ID_${i}`, `PERSON ${i}`));
    const s = sources({
      ch: {
        getOfficers: async (_n, o) => {
          expect(o?.cap).toBe(50);
          return res(fifty, officersEv(), { complete: false, note: "showing 50 of 200" });
        },
      },
    });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out.pinnedNodes).toBe(50);
    expect(out.incomplete).toEqual(["companies-house"]);
    expect(out.notes.join(" ")).toContain("showing 50 of 200");
    const row = (await listBoard(c.id, ALICE)).coverage.find(
      (r) => r.source === "companies-house",
    )!;
    expect(row.state).toBe("incomplete");
    expect(row.note).toContain("showing 50 of 200");
  });

  it("a limited partnership with no officers gets coverage not_read", async () => {
    const { c, company } = await ukCase({ type: "limited-partnership" });
    const s = sources({ ch: { getOfficers: async () => res([], officersEv()) } });

    const out = await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(out.pinnedNodes).toBe(0);
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.filter((n) => n.type === "person")).toHaveLength(0);
    expect(board.coverage.find((r) => r.source === "companies-house-partners")).toEqual({
      source: "companies-house-partners",
      state: "not_read",
      note: PARTNER_NOTE,
    });
    expect(out.notes).toContain(PARTNER_NOTE);
  });

  it("learns the company type from the register when the node does not carry it", async () => {
    const { c, company } = await ukCase({ type: "" });
    const getCompany = vi.fn(async () =>
      res<CompanyProfile>(
        { number: "OC000001", name: "ACME LP", status: "active", type: "limited-partnership", address: "1 Road" },
        ev("companies-house", "OC000001", `${CH}/company/OC000001`),
      ),
    );
    const s = sources({
      ch: { getOfficers: async () => res([], officersEv()), getCompany },
    });

    await expandCompany(s, args(c, company, { include: ["officers"] }));

    expect(getCompany).toHaveBeenCalledTimes(1);
    const board = await listBoard(c.id, ALICE);
    expect(board.coverage.some((r) => r.source === "companies-house-partners")).toBe(true);
  });

  it("controllers: individuals are people, entities are companies, super-secure ones are noted not pinned", async () => {
    const { c, company } = await ukCase();
    const controllers: Controller[] = [
      {
        id: "P1",
        name: "Mr A Person",
        kind: "individual-person-with-significant-control",
        natures: ["ownership-of-shares-75-to-100-percent"],
      },
      {
        id: "C1",
        name: "HOLDCO LTD",
        kind: "corporate-entity-person-with-significant-control",
        natures: [],
      },
      {
        id: "S1",
        name: "",
        kind: "super-secure-person-with-significant-control",
        natures: [],
      },
    ];
    const s = sources({
      ch: {
        getControllers: async () =>
          res(controllers, ev("companies-house", "OC000001", `${CH}/company/OC000001/persons-with-significant-control`)),
      },
    });

    const out = await expandCompany(s, args(c, company, { include: ["controllers"] }));

    expect(out).toMatchObject({ pinnedNodes: 2, pinnedEdges: 2 });
    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.find((n) => n.key === "psc:OC000001:P1")).toMatchObject({
      type: "person",
      facts: expect.objectContaining({ natures: "ownership-of-shares-75-to-100-percent" }),
    });
    expect(board.nodes.find((n) => n.key === "psc:OC000001:C1")?.type).toBe("company");
    expect(board.nodes.some((n) => n.key.includes("S1"))).toBe(false);
    expect(board.edges.every((e) => e.type === "controls" && e.toId === company.id)).toBe(true);
    expect(out.notes.join(" ")).toContain("super-secure");
  });

  it("address: one address node per normalised address, shared by companies", async () => {
    const a = await ukCase({ key: "OC000001", label: "ACME LLP" });
    const profile = (n: string, address: string) =>
      res<CompanyProfile>(
        { number: n, name: n, status: "active", type: "llp", address },
        ev("companies-house", n, `${CH}/company/${n}`),
      );
    await expandCompany(
      sources({ ch: { getCompany: async () => profile("OC000001", "10 High Street, Potters Bar, EN6 1AA") } }),
      args(a.c, a.company, { include: ["address"] }),
    );
    const second = await pinNode({
      caseId: a.c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "OC000002",
      label: "OTHER LLP",
      facts: { jurisdiction: "uk", type: "llp" },
      evidence: [ev("companies-house", "OC000002", `${CH}/company/OC000002`)],
      actor: "person",
      status: "confirmed",
    });

    await expandCompany(
      sources({ ch: { getCompany: async () => profile("OC000002", "10 HIGH STREET,  Potters Bar, EN6 1AA") } }),
      args(a.c, second, { include: ["address"] }),
    );

    const board = await listBoard(a.c.id, ALICE);
    const addresses = board.nodes.filter((n) => n.type === "address");
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({
      key: "10 high street potters bar en6 1aa",
      label: "10 High Street, Potters Bar, EN6 1AA",
    });
    expect(board.edges.filter((e) => e.type === "registered-at")).toHaveLength(2);
    expect(computeObservations(board)).toMatchObject([
      { kind: "shared-address", count: 2 },
    ]);
  });

  it("neighbours: pins only companies whose address agrees, as same-address edges", async () => {
    const { c, company } = await ukCase({ address: "10 High Street, Potters Bar, EN6 1AA" });
    const hit = (number: string, name: string, address: string) => ({ number, name, address });
    const searchByLocation = vi.fn(async () =>
      res(
        [
          hit("OC000001", "ACME LLP", "10 High Street, Potters Bar, EN6 1AA"),
          hit("OC000002", "NEIGHBOUR LTD", "10 High Street, Potters Bar, EN6 1AA, United Kingdom"),
          hit("OC000003", "ELSEWHERE LTD", "5 Other Road, Potters Bar, EN6 1XX"),
        ],
        ev("companies-house", "location:x", `${CH}/advanced-search/get-results?location=x`),
      ),
    );

    const out = await expandCompany(
      sources({ ch: { searchByLocation } }),
      args(c, company, { include: ["neighbours"] }),
    );

    expect(searchByLocation).toHaveBeenCalledWith("10 High Street, Potters Bar, EN6 1AA", { cap: 50 });
    expect(out).toMatchObject({ pinnedNodes: 1, pinnedEdges: 1 });
    const board = await listBoard(c.id, ALICE);
    const neighbour = board.nodes.find((n) => n.key === "OC000002")!;
    expect(neighbour).toMatchObject({ type: "company", label: "NEIGHBOUR LTD", status: "proposed" });
    expect(board.nodes.some((n) => n.key === "OC000003")).toBe(false);
    expect(board.edges[0]).toMatchObject({
      type: "same-address",
      fromId: company.id,
      toId: neighbour.id,
    });
    expect(out.notes.join(" ")).toContain("1 other");
  });

  it("filings: pins recent filings as document nodes keyed by transaction id", async () => {
    const { c, company } = await ukCase();
    const filings: Filing[] = [
      { transactionId: "MzAx", date: "2014-02-01", category: "accounts", type: "AA", description: "accounts-with-accounts-type-micro-entity" },
    ];
    const s = sources({
      ch: { getFilings: async () => res(filings, ev("companies-house", "OC000001", `${CH}/company/OC000001/filing-history`)) },
    });

    const out = await expandCompany(s, args(c, company, { include: ["filings"] }));

    expect(out.pinnedNodes).toBe(1);
    const doc = (await listBoard(c.id, ALICE)).nodes.find((n) => n.key === "MzAx")!;
    expect(doc).toMatchObject({ type: "document", status: "proposed" });
    expect(doc.evidence[0]).toMatchObject({ recordId: "MzAx" });
  });

  it("leaks: pins Offshore Leaks candidates as proposed candidate-match links with the score", async () => {
    const { c, company } = await ukCase();
    const candidates: IcijCandidate[] = [
      {
        id: "1001",
        name: "ACME LLP",
        score: 92,
        matched: false,
        description: "Entity in the Panama Papers",
        url: "https://offshoreleaks.icij.org/nodes/1001",
      },
    ];
    const s = sources({
      icij: { reconcile: async () => res(candidates, ev("icij", "acme", "https://offshoreleaks.icij.org/api/v1/reconcile")) },
    });

    const out = await expandCompany(s, args(c, company, { include: ["leaks"] }));

    expect(out).toMatchObject({ pinnedNodes: 1, pinnedEdges: 1 });
    const board = await listBoard(c.id, ALICE);
    const hit = board.nodes.find((n) => n.key === "icij:1001")!;
    expect(hit).toMatchObject({ type: "document", status: "proposed" });
    expect(hit.evidence[0]).toMatchObject({
      source: "icij",
      url: "https://offshoreleaks.icij.org/nodes/1001",
      recordId: "1001",
    });
    expect(hit.evidence[0]!.excerpt).toContain("92");
    expect(board.edges[0]).toMatchObject({
      type: "candidate-match",
      fromId: hit.id,
      toId: company.id,
      status: "proposed",
    });
    expect(board.coverage.find((r) => r.source === "icij")?.state).toBe("searched");
  });

  it("leaks: no candidates is 'no match', not an error", async () => {
    const { c, company } = await ukCase();
    const s = sources({
      icij: { reconcile: async () => res<IcijCandidate[]>([], ev("icij", "acme", "https://offshoreleaks.icij.org/api/v1/reconcile")) },
    });

    const out = await expandCompany(s, args(c, company, { include: ["leaks"] }));

    expect(out).toMatchObject({ pinnedNodes: 0, incomplete: [] });
    const row = (await listBoard(c.id, ALICE)).coverage.find((r) => r.source === "icij")!;
    expect(row.state).toBe("no_match");
  });

  it("refuses a node that is not an expandable company", async () => {
    const { c } = await ukCase();
    const person = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH}/company/OC000001/officers`)],
      actor: "agent",
    });

    await expect(expandCompany(sources(), args(c, person))).rejects.toBeInstanceOf(ExpandError);
    await expect(
      expandCompany(sources(), { ...args(c, person), nodeId: "missing" }),
    ).rejects.toMatchObject({ code: "node_not_found" });
  });

  it("refuses another owner's case", async () => {
    const { c, company } = await ukCase();
    await expect(
      expandCompany(sources(), { ...args(c, company), ownerEmail: BOB }),
    ).rejects.toBeInstanceOf(StoreError);
  });
});

const lei = (id: string, name: string, over: Partial<LeiRecord> = {}): LeiRecord => ({
  lei: id,
  name,
  status: "ACTIVE",
  parents: [],
  url: `https://search.gleif.org/#/record/${id}`,
  hash: `hash-${id}`,
  ...over,
});

describe("expandCompany (US)", () => {
  async function usCase() {
    const c = await createCase(ALICE, "US case");
    const company = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "company",
      key: "0001234567",
      label: "EXAMPLE HOLDINGS INC",
      facts: { jurisdiction: "us" },
      evidence: [ev("sec", "0001234567", "https://www.sec.gov/cgi-bin/browse-edgar?CIK=0001234567")],
      actor: "person",
      status: "confirmed",
    });
    return { c, company };
  }

  const secFilings: SecFiling[] = [
    {
      accession: "0001234567-24-000001",
      date: "2024-03-01",
      form: "10-K",
      description: "Annual report",
      url: "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000001/a10k.htm",
    },
    {
      accession: "0001234567-24-000002",
      date: "2024-05-01",
      form: "8-K",
      description: "Current report",
      url: "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000002/a8k.htm",
    },
  ];

  it("a US filer gets coverage not_available and no person nodes", async () => {
    const { c, company } = await usCase();
    const s = sources({
      sec: {
        recentFilings: async () =>
          res(secFilings, ev("sec", "0001234567", "https://data.sec.gov/submissions/CIK0001234567.json")),
      },
      gleif: {
        findByName: async () =>
          res(
            [lei("LEI0000000000000001", "EXAMPLE HOLDINGS INC", { parents: ["direct"] })],
            ev("gleif", "search:x", "https://search.gleif.org/"),
          ),
        getParent: async () => {
          const parent = lei("LEI0000000000000009", "EXAMPLE PARENT PLC");
          return res(parent, ev("gleif", parent.lei, parent.url));
        },
      },
      icij: { reconcile: async () => res<IcijCandidate[]>([], ev("icij", "q", "https://offshoreleaks.icij.org/")) },
    });

    const out = await expandCompany(s, args(c, company));

    const board = await listBoard(c.id, ALICE);
    expect(board.nodes.filter((n) => n.type === "person")).toHaveLength(0);
    expect(board.coverage.find((r) => r.source === "us-register")).toEqual({
      source: "us-register",
      state: "not_available",
      note: US_NOTE,
    });
    expect(board.nodes.filter((n) => n.type === "document").map((n) => n.key).sort()).toEqual([
      "0001234567-24-000001",
      "0001234567-24-000002",
    ]);
    const parent = board.nodes.find((n) => n.key === "lei:LEI0000000000000009")!;
    expect(parent).toMatchObject({ type: "company", label: "EXAMPLE PARENT PLC", status: "proposed" });
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]).toMatchObject({ type: "controls", fromId: parent.id, toId: company.id });
    expect(board.edges[0]!.evidence[0]).toMatchObject({ source: "gleif" });
    expect(out).toMatchObject({ pinnedNodes: 3, pinnedEdges: 1, incomplete: [] });
  });

  it("without an SEC contact the US path says so instead of failing", async () => {
    const { c, company } = await usCase();
    const s = sources({
      sec: {
        recentFilings: async () => {
          throw new SourceError("sec", "no_key", "SEC requests need a declared User-Agent with a contact; none is configured.");
        },
      },
      gleif: { findByName: async () => res<LeiRecord[]>([], ev("gleif", "q", "https://search.gleif.org/")) },
      icij: { reconcile: async () => res<IcijCandidate[]>([], ev("icij", "q", "https://offshoreleaks.icij.org/")) },
    });

    const out = await expandCompany(s, args(c, company));

    expect(out.incomplete).toEqual(["sec"]);
    const board = await listBoard(c.id, ALICE);
    expect(board.coverage.find((r) => r.source === "sec")).toMatchObject({ state: "not_read" });
    expect(board.coverage.find((r) => r.source === "gleif")?.state).toBe("no_match");
    expect(board.coverage.find((r) => r.source === "us-register")?.state).toBe("not_available");
  });

  it("does not take a loosely similar GLEIF name for this company", async () => {
    const { c, company } = await usCase();
    const getParent = vi.fn();
    const s = sources({
      sec: { recentFilings: async () => res([], ev("sec", "0001234567", "https://data.sec.gov/submissions/CIK0001234567.json")) },
      gleif: {
        findByName: async () =>
          res(
            [lei("LEI0000000000000002", "EXAMPLE HOLDINGS LIMITED", { parents: ["direct"] })],
            ev("gleif", "q", "https://search.gleif.org/"),
          ),
        getParent,
      },
      icij: { reconcile: async () => res<IcijCandidate[]>([], ev("icij", "q", "https://offshoreleaks.icij.org/")) },
    });

    await expandCompany(s, args(c, company));

    expect(getParent).not.toHaveBeenCalled();
    expect((await listBoard(c.id, ALICE)).coverage.find((r) => r.source === "gleif")?.state).toBe("no_match");
  });
});

describe("checkLeaks", () => {
  it("works on any node, including a person, and links the candidates to it", async () => {
    const { c } = await ukCase();
    const person = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH}/company/OC000001/officers`)],
      actor: "agent",
    });
    const reconcile = vi.fn(async () =>
      res<IcijCandidate[]>(
        [
          {
            id: "2002",
            name: "John Smith",
            score: 71,
            matched: false,
            description: "Officer in the Paradise Papers",
            url: "https://offshoreleaks.icij.org/nodes/2002",
          },
        ],
        ev("icij", "smith", "https://offshoreleaks.icij.org/api/v1/reconcile"),
      ),
    );

    const out = await checkLeaks(sources({ icij: { reconcile } }), args(c, person));

    expect(reconcile).toHaveBeenCalledWith("SMITH, John");
    expect(out).toMatchObject({ pinnedNodes: 1, pinnedEdges: 1, incomplete: [] });
    const board = await listBoard(c.id, ALICE);
    expect(board.edges[0]).toMatchObject({ type: "candidate-match", toId: person.id });
    expect(board.coverage.find((r) => r.source === "icij")?.state).toBe("searched");
  });
});

describe("expandOfficer", () => {
  it("pins each appointment as a company with an officer-of or member-of link", async () => {
    const { c } = await ukCase();
    const person = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "ID_A",
      label: "SMITH, John",
      facts: {},
      evidence: [ev("companies-house", "ID_A", `${CH}/company/OC000001/officers`)],
      actor: "agent",
    });
    const appointments: Appointment[] = [
      { companyNumber: "OC000002", companyName: "OTHER LLP", role: "llp-member", appointedOn: "2014-01-01" },
      { companyNumber: "09999999", companyName: "THIRD LTD", role: "director", companyStatus: "dissolved" },
    ];
    const getAppointments = vi.fn(async () =>
      res(appointments, ev("companies-house", "ID_A", `${CH}/officers/ID_A/appointments`)),
    );

    const out = await expandOfficer(sources({ ch: { getAppointments } }), args(c, person));

    expect(getAppointments).toHaveBeenCalledWith("ID_A", { cap: 50 });
    expect(out).toMatchObject({ pinnedNodes: 2, pinnedEdges: 2 });
    const board = await listBoard(c.id, ALICE);
    const other = board.nodes.find((n) => n.key === "OC000002")!;
    expect(other).toMatchObject({
      type: "company",
      label: "OTHER LLP",
      status: "proposed",
      facts: expect.objectContaining({ jurisdiction: "uk" }),
    });
    const edgeTo = (key: string) =>
      board.edges.find((e) => e.toId === board.nodes.find((n) => n.key === key)!.id)!;
    expect(edgeTo("OC000002")).toMatchObject({ type: "member-of", fromId: person.id });
    expect(edgeTo("09999999").type).toBe("officer-of");
    expect(edgeTo("09999999").evidence[0]).toMatchObject({ recordId: "ID_A" });
  });

  it("cannot expand a person the register gives no officer id for", async () => {
    const { c } = await ukCase();
    const psc = await pinNode({
      caseId: c.id,
      ownerEmail: ALICE,
      type: "person",
      key: "psc:OC000001:P1",
      label: "Mr A Person",
      facts: {},
      evidence: [ev("companies-house", "P1", `${CH}/company/OC000001/persons-with-significant-control`)],
      actor: "agent",
    });

    await expect(expandOfficer(sources(), args(c, psc))).rejects.toMatchObject({
      code: "bad_node",
    });
  });
});
