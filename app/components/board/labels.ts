import type { CoverageState } from "../../../server/board/types";

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

/** The framework words a failure as "Action <name> failed: <reason>"; the person only needs the reason. */
export function plainError(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const reason = e.message.replace(/^Action [\w-]+ failed:\s*/, "").trim();
  return reason || fallback;
}
