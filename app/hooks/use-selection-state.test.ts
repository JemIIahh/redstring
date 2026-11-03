import { describe, expect, it } from "vitest";

import { selectionKeys, selectionStateFor } from "./use-selection-state";

describe("selection state", () => {
  it("holds the case id and the selected ids and nothing else", () => {
    expect(selectionStateFor("c1", ["n1", "e2"])).toEqual({ caseId: "c1", ids: ["n1", "e2"] });
  });

  it("is empty (null) when nothing is selected, so the agent sees no selection rather than a stale one", () => {
    expect(selectionStateFor("c1", [])).toBeNull();
  });

  it("drops repeats and blanks and keeps the order the person clicked in", () => {
    expect(selectionStateFor("c1", ["b", "a", "b", "", "a"])).toEqual({ caseId: "c1", ids: ["b", "a"] });
    expect(selectionStateFor("c1", ["", ""])).toBeNull();
  });

  it("is written to the shared key and to this browser tab's key, like navigation", () => {
    expect(selectionKeys("tab-9")).toEqual(["selection", "selection:tab-9"]);
    expect(selectionKeys("")).toEqual(["selection"]);
    expect(selectionKeys(undefined)).toEqual(["selection"]);
  });
});
