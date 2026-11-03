import { describe, expect, it } from "vitest";

import { navigationStateForPath, pathForCommand } from "./use-navigation-state";

describe("navigation state for the case pages", () => {
  it("reports the open case and the node in the address, so the agent knows what the person is looking at", () => {
    const state = navigationStateForPath("/case/abc123", new URLSearchParams("node=n1"));
    expect(state).toMatchObject({ view: "case", caseId: "abc123", nodeId: "n1", path: "/case/abc123" });
  });

  it("reports a case with no node, and ignores an empty node", () => {
    expect(navigationStateForPath("/case/abc123")).toMatchObject({ view: "case", caseId: "abc123" });
    expect(navigationStateForPath("/case/abc123")).not.toHaveProperty("nodeId");
    expect(navigationStateForPath("/case/abc123", new URLSearchParams("node="))).not.toHaveProperty(
      "nodeId",
    );
  });

  it("decodes an encoded case id and does not throw on a broken one", () => {
    expect(navigationStateForPath("/case/a%20b")).toMatchObject({ caseId: "a b" });
    expect(() => navigationStateForPath("/case/%E0%A4%A")).not.toThrow();
  });

  it("calls the case list its own view and keeps /case and /cases apart", () => {
    expect(navigationStateForPath("/cases").view).toBe("cases");
    expect(navigationStateForPath("/cases")).not.toHaveProperty("caseId");
  });

  it("still describes the template's own pages the way it did", () => {
    expect(navigationStateForPath("/home").view).toBe("home");
    expect(navigationStateForPath("/settings").view).toBe("settings");
  });
});

describe("navigate commands for the case pages", () => {
  it("opens a case, and a node on it, from the command navigate-to-node writes", () => {
    expect(pathForCommand({ view: "case", caseId: "abc123" })).toBe("/case/abc123");
    expect(pathForCommand({ view: "case", caseId: "abc123", nodeId: "n1" })).toBe(
      "/case/abc123?node=n1",
    );
  });

  it("encodes ids so a stray character cannot change the route", () => {
    expect(pathForCommand({ view: "case", caseId: "a/b", nodeId: "n 1&x=1" })).toBe(
      "/case/a%2Fb?node=n%201%26x%3D1",
    );
  });

  it("falls back to the case list when a case command has no usable id", () => {
    expect(pathForCommand({ view: "case" })).toBe("/cases");
    expect(pathForCommand({ view: "case", caseId: "   " })).toBe("/cases");
    expect(pathForCommand({ view: "case", caseId: 42 })).toBe("/cases");
    expect(pathForCommand({ view: "cases" })).toBe("/cases");
  });

  it("still sends the template's own views where it did", () => {
    expect(pathForCommand({ view: "settings" })).toBe("/settings");
    expect(pathForCommand({ view: "nonsense" })).toBe("/home");
  });
});
