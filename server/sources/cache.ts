export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export function createCache(ttlMs: number, now: () => number = Date.now): Cache {
  const entries = new Map<string, { value: unknown; at: number }>();
  return {
    get<T>(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    set<T>(key: string, value: T): void {
      entries.set(key, { value, at: now() });
    },
  };
}
