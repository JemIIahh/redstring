import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { usage } from "../db/schema.js";

export type CapKind = "ch-call" | "case-create" | "agent-run";

/** Thrown when a daily limit is spent or the kill switch is on. The message is safe to show. */
export class CapError extends Error {
  constructor(readonly kind: CapKind | "kill-switch") {
    super("Daily limit reached. Try again tomorrow.");
    this.name = "CapError";
  }
}

/** A whole number from the environment; anything else falls back to the default. */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : fallback;
}

const perUserLimit = (kind: CapKind): number => {
  switch (kind) {
    case "ch-call":
      return intEnv("REDSTRING_CH_CALLS_PER_USER_DAY", 300);
    case "case-create":
      return intEnv("REDSTRING_CASES_PER_USER_DAY", 10);
    case "agent-run":
      return intEnv("REDSTRING_AGENT_RUNS_PER_USER_DAY", 20);
  }
};

const killSwitchOn = (): boolean => {
  const raw = process.env.REDSTRING_KILL_SWITCH?.trim();
  return !!raw && raw !== "0";
};

/** UTC calendar day, which is the bucket every daily count lives in. */
const dayBucket = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Throws `CapError` if this owner may not do `kind` right now. The check and
 * the later `recordUsage` are two steps, so a burst of parallel calls can
 * overshoot a limit by a few; these are cost guards, not accounting.
 */
export async function assertWithinCaps(
  ownerEmail: string,
  kind: CapKind,
  now: Date = new Date(),
): Promise<void> {
  if (killSwitchOn()) throw new CapError("kill-switch");

  const db = getDb();
  const bucket = dayBucket(now);

  const [mine] = await db
    .select({ n: sql<number>`coalesce(sum(${usage.count}), 0)::int` })
    .from(usage)
    .where(
      and(
        eq(usage.ownerEmail, ownerEmail),
        eq(usage.kind, kind),
        eq(usage.bucket, bucket),
      ),
    );
  if ((mine?.n ?? 0) >= perUserLimit(kind)) throw new CapError(kind);

  if (kind === "ch-call") {
    const [all] = await db
      .select({ n: sql<number>`coalesce(sum(${usage.count}), 0)::int` })
      .from(usage)
      .where(and(eq(usage.kind, kind), eq(usage.bucket, bucket)));
    if ((all?.n ?? 0) >= intEnv("REDSTRING_CH_CALLS_GLOBAL_DAY", 2500)) {
      throw new CapError(kind);
    }
  }
}

export async function recordUsage(
  ownerEmail: string,
  kind: CapKind,
  n = 1,
  now: Date = new Date(),
): Promise<void> {
  await getDb()
    .insert(usage)
    .values({
      id: randomUUID(),
      ownerEmail,
      kind,
      bucket: dayBucket(now),
      count: n,
    })
    .onConflictDoUpdate({
      target: [usage.ownerEmail, usage.kind, usage.bucket],
      set: { count: sql`${usage.count} + ${n}` },
    });
}
