import { handleMcpFetchRequest } from "@agent-native/core/mcp";
import { describe, expect, it } from "vitest";

import { MCP_OPTIONS } from "./config.js";

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
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const config = {
    name: "redstring",
    description: "Redstring",
    appId: "redstring",
    actions: registry,
    productionActions: registry,
    builtinCrossAppTools: MCP_OPTIONS.builtinCrossAppTools,
  };
  const res = await handleMcpFetchRequest(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    config as never,
    // A signed-in person, with no organisation (so nothing is looked up in a database).
    { identity: { userEmail: "alice@example.com", orgId: null } as never, requestMeta: { transport: "http", inlineMcpApps: false } as never },
  );
  const text = await res.text();
  const data = text.includes("data:") ? text.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : text;
  return JSON.parse(data) as { result?: { tools?: Array<{ name: string }> }; error?: { message: string } };
}

describe("what an outside MCP client is offered", () => {
  it("is exactly the four read tools: no person-only action, no export, and not ask_app, which would run our agent outside the spend guard", async () => {
    const out = await rpc("tools/list");
    const names = (out.result?.tools ?? []).map((t) => t.name);

    // Adding to this list gives outside agents a new power, so it is a choice made here.
    expect(names.sort(), JSON.stringify(out.error ?? names)).toEqual(["get-board", "list-cases", "list-changes", "search-entity"]);
    expect(names).not.toContain("ask_app");
    expect(names).not.toContain("ask_app_status");
    expect(names).not.toContain("ask-agent");
  });

  it("refuses a person-only action called by name anyway, and a made-up one", async () => {
    for (const name of ["set-status", "create-case", "export-brief", "ask_app", "no-such-tool"]) {
      const out = await rpc("tools/call", { name, arguments: { caseId: "c1", targetKind: "node", targetId: "n1", to: "confirmed" } });
      const result = (out as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }).result;
      const refused = Boolean(out.error) || result?.isError === true;
      expect(refused, `${name}: ${JSON.stringify(out).slice(0, 200)}`).toBe(true);
    }
  });
});
