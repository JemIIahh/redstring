import { createHash } from "node:crypto";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])]),
    );
  }
  return value;
}

/** sha-256 hex of the body as JSON with object keys sorted, so key order never changes the hash. */
export function contentHash(body: unknown): string {
  const json = JSON.stringify(sortKeys(body)) ?? "null";
  return createHash("sha256").update(json).digest("hex");
}
