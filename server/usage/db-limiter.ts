import { randomUUID } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { usage } from "../db/schema.js";
import type { Limiter } from "../sources/types.js";

/**
 * A fixed-window limiter whose count lives in the database, so every server
 * instance draws from the same budget. Windows are aligned to multiples of
 * `windowMs`. Each `take` is one statement that only counts up while the
 * window is under `max`, so parallel callers cannot get past it.
 */
export function createDbLimiter(o: {
  key: string;
  max: number;
  windowMs: number;
  now?: () => number;
}): Limiter {
  const now = o.now ?? Date.now;
  const windowStart = (t: number) => Math.floor(t / o.windowMs) * o.windowMs;

  return {
    async take() {
      if (o.max <= 0) return false;
      const rows = await getDb()
        .insert(usage)
        .values({
          id: randomUUID(),
          ownerEmail: "_limiter",
          kind: "window",
          bucket: `w:${o.key}:${windowStart(now())}`,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [usage.ownerEmail, usage.kind, usage.bucket],
          set: { count: sql`${usage.count} + 1` },
          setWhere: lt(usage.count, o.max),
        })
        .returning({ count: usage.count });
      return rows.length > 0;
    },
    resetAt() {
      return windowStart(now()) + o.windowMs;
    },
  };
}
