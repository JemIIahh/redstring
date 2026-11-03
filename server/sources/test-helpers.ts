import { readFileSync } from "node:fs";

import { vi } from "vitest";

export function fixture(path: string): any {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8"),
  );
}

export type Reply = { status?: number; body?: unknown; text?: string };

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** A fetch that answers from a handler and records every call. */
export function fakeFetch(handler: (call: RecordedCall) => Reply | undefined) {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const call: RecordedCall = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const reply = handler(call) ?? { status: 404, body: {} };
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}
