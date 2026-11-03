// Test helpers: stand-in source clients and evidence builders. Not used by app code.
import type { ChClient } from "../sources/companies-house.js";
import type { GleifClient } from "../sources/gleif.js";
import type { IcijClient } from "../sources/icij.js";
import type { Sources } from "../sources/registry.js";
import type { SecClient } from "../sources/sec.js";
import type { SourceResult } from "../sources/types.js";
import type { EvidenceInput, EvidenceSource } from "./types.js";

export const NOW = "2026-11-03T10:00:00.000Z";
export const CH_PUBLIC = "https://find-and-update.company-information.service.gov.uk";

export const ev = (
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

export function res<T>(
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

/** Sources whose every method throws unless a test supplies it. */
export function fakeSources(
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
