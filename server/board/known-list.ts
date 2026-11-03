import type { Board } from "./types.js";

// Long and short forms of the same company-type word.
const SAME_WORD: Record<string, string> = {
  limited: "ltd",
  incorporated: "inc",
  corporation: "corp",
  company: "co",
};

/** A name reduced to what identifies it: no case, no stops or commas, "&" as "and", one spelling of ltd/inc/corp/co. */
export function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => SAME_WORD[w] ?? w)
    .join(" ");
}

/** A company number as written in a register, with no spaces: "oc 346224" is "OC346224". */
function compactNumber(raw: string): string | null {
  const c = raw.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{0,2}\d{5,8}$/.test(c) ? c : null;
}

/**
 * Which entries of a published list are already on the board, matching by name or by
 * company number. A card the person rejected does not count: they decided it is not
 * the company. Names come back as the person typed them, once each, in order.
 */
export function checkKnownList(
  names: string[],
  board: Pick<Board, "nodes">,
): { found: string[]; missing: string[] } {
  const onBoard = new Set<string>();
  for (const n of board.nodes) {
    if (n.status === "rejected") continue;
    const name = normaliseName(n.label);
    if (name) onBoard.add(`name:${name}`);
    for (const num of [n.key, n.facts.number]) {
      const c = num ? compactNumber(num) : null;
      if (c) onBoard.add(`num:${c}`);
    }
  }

  const seen = new Set<string>();
  const found: string[] = [];
  const missing: string[] = [];
  for (const raw of names) {
    const entry = raw.trim();
    if (!entry) continue;
    const num = compactNumber(entry);
    const id = num ? `num:${num}` : `name:${normaliseName(entry)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    (onBoard.has(id) ? found : missing).push(entry);
  }
  return { found, missing };
}
