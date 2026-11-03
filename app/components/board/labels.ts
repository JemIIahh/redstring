export { COVERAGE_WORD, sourceLabel } from "../../../server/board/wording";

/** The framework words a failure as "Action <name> failed: <reason>"; the person only needs the reason. */
export function plainError(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const reason = e.message.replace(/^Action [\w-]+ failed:\s*/, "").trim();
  return reason || fallback;
}
