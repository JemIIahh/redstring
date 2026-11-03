import type { Limiter } from "./types.js";

/**
 * In-memory fixed-window limiter. It does not hold across serverless
 * instances; the database-backed one in `usage/db-limiter.ts` does.
 */
export function createLimiter(o: {
  max: number;
  windowMs: number;
  now?: () => number;
}): Limiter {
  const now = o.now ?? Date.now;
  let windowStart: number | undefined;
  let count = 0;

  const expired = (t: number) =>
    windowStart === undefined || t >= windowStart + o.windowMs;

  return {
    async take() {
      const t = now();
      if (expired(t)) {
        windowStart = t;
        count = 0;
      }
      if (count >= o.max) return false;
      count += 1;
      return true;
    },
    resetAt() {
      const t = now();
      return expired(t) ? t : (windowStart as number) + o.windowMs;
    },
  };
}
