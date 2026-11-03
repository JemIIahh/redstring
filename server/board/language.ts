// Words the agent must not write about a person or company. The check applies
// only to text the agent writes itself (reasons, summaries, brief text). Names
// and fields copied from a record are not linted: a real company may be called
// "Fraud Prevention Ltd".
export const BANNED_WORDS = [
  "suspicious",
  "shady",
  "guilty",
  "criminal",
  "fraud",
  "fraudulent",
  "launderer",
  "laundering",
  "corrupt",
  "illegal",
  "scam",
] as const;

export class LanguageError extends Error {
  constructor(readonly words: string[]) {
    super(`Wording not allowed: ${words.join(", ")}`);
    this.name = "LanguageError";
  }
}

// Whole words only, case-insensitive, with an optional plural ending.
const PATTERN = new RegExp(`\\b(${BANNED_WORDS.join("|")})(?:s|es)?\\b`, "gi");

/** Banned words found, in order of first appearance, each once, in base form. */
export function lintAgentText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PATTERN)) {
    const word = (match[1] ?? "").toLowerCase();
    if (!found.includes(word)) found.push(word);
  }
  return found;
}

export function assertAgentText(text: string): void {
  const words = lintAgentText(text);
  if (words.length > 0) throw new LanguageError(words);
}
