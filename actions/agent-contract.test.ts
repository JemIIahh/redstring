import {
  actionsToEngineTools,
  filterInitialEngineTools,
  FRAMEWORK_TOOL_GROUPS,
  resolveFrameworkTools,
} from "@agent-native/core/server";
import { describe, expect, it } from "vitest";

import { lintAgentText } from "../server/board/language.js";
import {
  AGENT_TOOL_NAMES,
  FRAMEWORK_TOOLS,
  SYSTEM_PROMPT,
} from "../server/agent/config.js";

// Every action file in actions/, built the way the generated registry is. run.ts is the CLI
// runner, not an action: it exits the process when imported.
const files = import.meta.glob<{ default?: unknown }>(
  ["./*.ts", "!./*.test.ts", "!./run.ts"],
  { eager: true },
);
const registry = Object.fromEntries(
  Object.entries(files)
    .map(([path, mod]) => [path.replace(/^\.\//, "").replace(/\.ts$/, ""), mod.default])
    .filter(([, entry]) => entry && typeof entry === "object" && "tool" in entry),
) as Parameters<typeof actionsToEngineTools>[0];

/** What only the person does: the agent must never be handed these. */
const PERSON_ONLY = [
  "create-case",
  "pin-item",
  "set-status",
  "annotate",
  "move-node",
  "review-change",
  "review-suggestion",
  "watch-entity",
];

describe("the agent's tool surface", () => {
  const all = actionsToEngineTools(registry).map((t) => t.name);
  const first = filterInitialEngineTools(actionsToEngineTools(registry), [...AGENT_TOOL_NAMES]).map(
    (t) => t.name,
  );

  it("the tool list the agent receives excludes create-case, pin-item, set-status, annotate, move-node, review-change and watch-entity", () => {
    for (const name of PERSON_ONLY) {
      expect(all, `${name} is not an agent tool`).not.toContain(name);
      expect(first, `${name} is not in the first request`).not.toContain(name);
      expect(AGENT_TOOL_NAMES as readonly string[], `${name} is not a starter tool`).not.toContain(name);
    }
  });

  it("starts the agent with exactly the board tools it needs, and each of them exists", () => {
    expect([...AGENT_TOOL_NAMES].sort()).toEqual(
      [
        "check-leaks",
        "expand-node",
        "export-brief",
        "get-board",
        "list-changes",
        "navigate-to-node",
        "search-entity",
        "snapshot-watches",
        "suggest-reject",
        "view-screen",
      ].sort(),
    );
    for (const name of AGENT_TOOL_NAMES) expect(all, `${name} exists`).toContain(name);
    for (const name of AGENT_TOOL_NAMES) expect(first, `${name} is sent first`).toContain(name);
  });

  it("every status-changing power the agent has can only leave an item proposed or suggest", () => {
    // The agent's way to say "reject this" is a suggestion; there is no tool that decides.
    expect(all).toContain("suggest-reject");
    expect(all.filter((n) => /^(set|confirm|reject|dead)/.test(n))).toEqual([]);
  });

  it("has no raw database tool and none of the framework's sharing, org, key, audit or web tools", () => {
    const resolved = resolveFrameworkTools({ frameworkTools: FRAMEWORK_TOOLS });
    // A database tool could write rows directly and skip the rules about sources and status.
    expect(resolved.database).toBe("off");
    expect(resolved.extensions).toBe(false);
    for (const group of FRAMEWORK_TOOL_GROUPS) {
      expect(resolved.isEnabled(group), `${group} is off`).toBe(false);
    }
  });
});

describe("the agent's instructions", () => {
  const prompt = SYSTEM_PROMPT.toLowerCase();

  it("tell it to read the screen before acting, so 'this one' means the selected item", () => {
    expect(prompt).toContain("view-screen");
    expect(prompt).toMatch(/before you act|before acting/);
    expect(prompt).toContain("selected");
  });

  it("tell it to pin only what a record shows and name the record", () => {
    expect(prompt).toMatch(/only what a record shows/);
    expect(prompt).toMatch(/name the record/);
  });

  it("tell it to describe records, never people, with an example", () => {
    expect(prompt).toMatch(/describe records, never people/);
    expect(SYSTEM_PROMPT).toContain("Companies House lists");
  });

  it("tell it never to merge people with the same name", () => {
    expect(prompt).toMatch(/never merge people who share a name|never merge people with the same name/);
  });

  it("tell it to suggest when unsure, and to decline to confirm or reject", () => {
    expect(prompt).toMatch(/when unsure, suggest/);
    expect(prompt).toMatch(/decline/);
    expect(prompt).toContain("suggest-reject");
  });

  it("tell it to say what it could not read, and to skip dead ends and say how many", () => {
    expect(prompt).toMatch(/say what you could not read/);
    expect(prompt).toMatch(/skip dead ends/);
    expect(prompt).toMatch(/say how many/);
  });

  it("do not use the words the agent itself is barred from writing", () => {
    expect(lintAgentText(SYSTEM_PROMPT)).toEqual([]);
  });
});
