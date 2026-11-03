import type { EvidenceInput } from "../board/types.js";

/** What every source client returns: the data, where it came from, and whether it is all of it. */
export interface SourceResult<T> {
  data: T;
  evidence: EvidenceInput;
  /** False when the list was cut short; `note` says how (for example "showing 50 of 200"). */
  complete: boolean;
  note?: string;
  /** How many records the source holds in all, when it says so (a list cut short still reports the whole). */
  total?: number;
}

export type SourceErrorKind =
  | "rate_limited"
  | "not_found"
  | "timeout"
  | "bad_response"
  | "no_key";

export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly kind: SourceErrorKind,
    message?: string,
  ) {
    super(message ?? `${source}: ${kind}`);
    this.name = "SourceError";
  }
}

export interface Limiter {
  /** True if the call may go ahead; false once the window's allowance is spent. */
  take(): Promise<boolean>;
  /** Epoch milliseconds when more calls are allowed again. */
  resetAt(): number;
}
