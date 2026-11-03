import { describe, expect, it } from "vitest";

import { SourceError } from "./types.js";

describe("SourceError", () => {
  it("is an Error that carries the source and the kind", () => {
    const e = new SourceError("companies-house", "rate_limited", "slow down");
    expect(e).toBeInstanceOf(Error);
    expect(e.source).toBe("companies-house");
    expect(e.kind).toBe("rate_limited");
    expect(e.message).toBe("slow down");
  });

  it("has a readable default message", () => {
    expect(new SourceError("icij", "timeout").message).toBe("icij: timeout");
  });
});
