import { settings } from "../config.js";
import { releaseUsage, takeUsage } from "../usage/caps.js";
import { createDbLimiter } from "../usage/db-limiter.js";
import { createCache, type Cache } from "./cache.js";
import { createChClient, type ChClient } from "./companies-house.js";
import { createGleifClient, type GleifClient } from "./gleif.js";
import { createIcijClient, type IcijClient } from "./icij.js";
import { createLimiter } from "./limiter.js";
import { createSecClient, type SecClient } from "./sec.js";
import type { Limiter } from "./types.js";

export interface Sources {
  ch: ChClient;
  icij: IcijClient;
  gleif: GleifClient;
  sec: SecClient;
}

export interface SourceDeps {
  fetch?: typeof fetch;
  /** One cache for every client; by default each source keeps its own, shared across users. */
  cache?: Cache;
  /** Companies House calls allowed per five minutes across all users. */
  sharedMax?: number;
  /** Clock for the shared window. */
  now?: () => number;
}

// Public records are the same for everyone, so these outlive a single request.
const chCache = createCache(10 * 60_000);
const secCache = createCache(60 * 60_000);
const secLimiter = createLimiter({ max: 10, windowMs: 1000 });

/** Companies House allows 600 per five minutes; the app keeps back 100 for itself. */
const CH_SHARED_MAX = 500;
const CH_WINDOW_MS = 5 * 60_000;

/**
 * The one place a request gets its source clients. Companies House calls are
 * checked against this person's daily limit and the app-wide limits, and each
 * call that actually goes out is counted. Answers served from the cache are
 * free.
 */
export function buildSources(ownerEmail: string, deps: SourceDeps = {}): Sources {
  const shared = createDbLimiter({
    key: "companies-house",
    max: deps.sharedMax ?? CH_SHARED_MAX,
    windowMs: CH_WINDOW_MS,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const chLimiter: Limiter = {
    async take() {
      await takeUsage(ownerEmail, "ch-call");
      if (!(await shared.take())) {
        // Nothing went out, so the person is not charged for it.
        await releaseUsage(ownerEmail, "ch-call");
        return false;
      }
      return true;
    },
    resetAt: () => shared.resetAt(),
  };

  const fetchOpt = deps.fetch ? { fetch: deps.fetch } : {};

  return {
    ch: createChClient({
      apiKey: settings.companiesHouseApiKey(),
      limiter: chLimiter,
      cache: deps.cache ?? chCache,
      ...fetchOpt,
    }),
    icij: createIcijClient({ ...fetchOpt }),
    gleif: createGleifClient({ ...fetchOpt }),
    sec: createSecClient({
      userAgent: settings.secUserAgent(),
      limiter: secLimiter,
      cache: deps.cache ?? secCache,
      ...fetchOpt,
    }),
  };
}
