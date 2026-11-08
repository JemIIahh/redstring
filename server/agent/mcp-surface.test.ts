import { readFileSync } from "node:fs";

import { handleMcpFetchRequest } from "@agent-native/core/mcp";
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import { MCP_OPTIONS, MCP_READ_TOOLS, mcpDenyActions } from "./config.js";

// Every action file in actions/, built the way the generated registry is.
const files = import.meta.glob<{ default?: unknown }>(["../../actions/*.ts", "!../../actions/*.test.ts", "!../../actions/run.ts"], {
  eager: true,
});
const registry = Object.fromEntries(
  Object.entries(files)
    .map(([path, mod]) => [path.replace(/^.*\//, "").replace(/\.ts$/, ""), mod.default])
    .filter(([, entry]) => entry && typeof entry === "object" && "tool" in entry),
) as Record<string, never>;

/** One JSON-RPC call to the framework's own MCP request handler, with a signed-in identity. */
const askAgentCalls: string[] = [];
const runtimeActions = {
  ...registry,
  // Production injects this after the app builds its deny list. The old
  // registry-only test missed the fifth tool exposed by the hosted server.
  "tool-search": defineAction({
    description: "Production-injected discovery fixture",
    schema: z.object({ query: z.string().optional() }),
    run: async () => { throw new Error("External discovery must stay closed"); },
  }),
};

async function rpc(method: string, params: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  const config = {
    name: "redstring",
    description: "Redstring",
    appId: "redstring",
    actions: runtimeActions,
    productionActions: runtimeActions,
    builtinCrossAppTools: MCP_OPTIONS.builtinCrossAppTools,
    // What the plugin does: deny everything but the read tools, from the whole registry.
    externalAgents: { denyActions: mcpDenyActions(Object.keys(registry)) },
    // The real plugin always hands the framework a function that runs the app's own agent; a
    // stand-in that records its calls shows whether any MCP path can reach it.
    askAgent: async (message: string) => {
      askAgentCalls.push(message);
      return "the agent ran";
    },
  };
  const res = await handleMcpFetchRequest(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    config as never,
    // A signed-in person, with no organisation (so nothing is looked up in a database).
    { identity: { userEmail: "alice@example.com", orgId: null } as never, requestMeta: { transport: "http", inlineMcpApps: false, ...meta } as never },
  );
  const text = await res.text();
  const data = text.includes("data:") ? text.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : text;
  return JSON.parse(data) as { result?: { tools?: Array<{ name: string }> }; error?: { message: string } };
}

const SPEND_PATHS = ["ask_app", "ask_app_status", "ask-agent"];

describe("mcpDenyActions", () => {
  it("always denies the ways into our agent, allows only the read tools, and closes any new action", () => {
    const denied = mcpDenyActions([...MCP_READ_TOOLS, "set-status", "brand-new-action", "framework-thing"]);
    expect(denied).toEqual(expect.arrayContaining([...SPEND_PATHS, "set-status", "brand-new-action", "framework-thing"]));
    for (const tool of MCP_READ_TOOLS) expect(denied).not.toContain(tool);
    // Even an empty registry denies the spend paths.
    expect(mcpDenyActions([])).toEqual([...SPEND_PATHS, "tool-search"].sort());
  });
});

// The default catalog, and the full catalog that a token minted with --full-catalog (or
// AGENT_NATIVE_MCP_FULL_CATALOG=1) gets: neither may reach the app's own agent.
describe.each([
  ["the default catalog", {}],
  ["the full catalog", { fullCatalog: true }],
])("what an outside MCP client is offered: %s", (_label, meta) => {
  it("is exactly the four read tools: no person-only action, no export, and nothing that runs our agent outside the spend guard", async () => {
    const out = await rpc("tools/list", {}, meta);
    const names = (out.result?.tools ?? []).map((t) => t.name);

    // Adding to this list gives outside agents a new power, so it is a choice made here.
    expect(names.sort(), JSON.stringify(out.error ?? names)).toEqual(["get-board", "list-cases", "list-changes", "search-entity"]);
    for (const spend of SPEND_PATHS) expect(names).not.toContain(spend);
  });

  it("refuses a person-only action, the export and every way into our agent when called by name, and never runs the agent", async () => {
    askAgentCalls.length = 0;
    for (const name of ["set-status", "create-case", "export-brief", ...SPEND_PATHS, "tool-search", "no-such-tool"]) {
      const out = await rpc(
        "tools/call",
        { name, arguments: { message: "spend the key", app: "redstring", caseId: "c1", targetKind: "node", targetId: "n1", to: "confirmed" } },
        meta,
      );
      const result = (out as { result?: { isError?: boolean } }).result;
      const refused = Boolean(out.error) || result?.isError === true;
      expect(refused, `${name}: ${JSON.stringify(out).slice(0, 200)}`).toBe(true);
    }
    expect(askAgentCalls).toEqual([]);
  });
});

describe("the plugin", () => {
  // The tests above build the MCP config themselves, as the plugin does. This keeps the plugin
  // from quietly dropping what they assume: the options, and a deny list made from the whole
  // registry (framework actions included), not just our own files.
  it("hands the framework the same options and a deny list built from the whole action registry", () => {
    const source = readFileSync(new URL("../plugins/agent-chat.ts", import.meta.url), "utf8");
    expect(source).toContain("...MCP_OPTIONS");
    expect(source).toContain("externalAgents: { denyActions: mcpDenyActions(Object.keys(actionsRegistry)) }");
  });
});
