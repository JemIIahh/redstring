import { randomUUID } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { settings } from "../config.js";
import { usage } from "../db/schema.js";

export type CapKind = "ch-call" | "case-create" | "agent-run" | "agent-continuation";

/** Thrown when a daily limit is spent or the kill switch is on. The message is safe to show. */
export class CapError extends Error {
  constructor(readonly kind: CapKind | "kill-switch") {
    super("Daily limit reached. Try again tomorrow.");
    this.name = "CapError";
  }
}

/** A whole number from a setting; anything else falls back to the default. */
function wholeNumber(raw: string | undefined, fallback: number): number {
  return raw && /^\d+$/.test(raw) ? Number(raw) : fallback;
}

const perUserLimit = (kind: CapKind): number => {
  switch (kind) {
    case "ch-call":
      return wholeNumber(settings.chCallsPerUserDay(), 300);
    case "case-create":
      return wholeNumber(settings.casesPerUserDay(), 10);
    case "agent-run":
      return wholeNumber(settings.agentRunsPerUserDay(), 20);
    case "agent-continuation":
      // A continuation is the same question carried on, but the marker that says so comes
      // from the browser, so it is counted too, against a looser limit.
      return wholeNumber(
        settings.agentContinuationsPerUserDay(),
        10 * wholeNumber(settings.agentRunsPerUserDay(), 20),
      );
  }
};

const killSwitchOn = (): boolean => {
  const raw = settings.killSwitch();
  return !!raw && raw !== "0";
};

/** Throws `CapError` if the kill switch is on. Checked on its own for work that is not counted. */
export async function assertKillSwitchOff(): Promise<void> {
  if (killSwitchOn()) throw new CapError("kill-switch");
}

/** UTC calendar day, which is the bucket every daily count lives in. */
const dayBucket = (now: Date) => now.toISOString().slice(0, 10);

/** Adds one to a counter only while it is under `max`, in one statement. True if it was added. */
async function takeOne(owner: string, kind: string, bucket: string, max: number): Promise<boolean> {
  if (max <= 0) return false;
  const rows = await getDb()
    .insert(usage)
    .values({ id: randomUUID(), ownerEmail: owner, kind, bucket, count: 1 })
    .onConflictDoUpdate({
      target: [usage.ownerEmail, usage.kind, usage.bucket],
      set: { count: sql`${usage.count} + 1` },
      setWhere: lt(usage.count, max),
    })
    .returning({ count: usage.count });
  return rows.length > 0;
}

/** The app-wide counter for Companies House calls lives under this owner. */
const GLOBAL = "_global";

/**
 * Counts one `kind` of work against this owner's day, or throws `CapError` if the day's limit is
 * spent or the kill switch is on. The check and the count are one statement, so a burst of parallel
 * calls cannot get past a limit. A Companies House call also has to fit in the app-wide budget; if
 * it does not, the person's own count is given back, so being turned away costs nothing.
 */
export async function takeUsage(
  ownerEmail: string,
  kind: CapKind,
  now: Date = new Date(),
): Promise<void> {
  await assertKillSwitchOff();
  const bucket = dayBucket(now);

  if (!(await takeOne(ownerEmail, kind, bucket, perUserLimit(kind)))) throw new CapError(kind);

  if (kind === "ch-call") {
    const globalMax = wholeNumber(settings.chCallsGlobalDay(), 2500);
    if (!(await takeOne(GLOBAL, kind, bucket, globalMax))) {
      await recordUsage(ownerEmail, kind, -1, now);
      throw new CapError(kind);
    }
  }
}

/** Gives back one count taken by `takeUsage` for work that then did not happen. */
export async function releaseUsage(
  ownerEmail: string,
  kind: CapKind,
  now: Date = new Date(),
): Promise<void> {
  await recordUsage(ownerEmail, kind, -1, now);
  if (kind === "ch-call") await recordUsage(GLOBAL, kind, -1, now);
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
