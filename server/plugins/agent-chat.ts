import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { AGENT_TOOL_NAMES, FRAMEWORK_TOOLS, MCP_OPTIONS, mcpDenyActions, SYSTEM_PROMPT } from "../agent/config.js";
import { guardAgentRun } from "../agent/run-guard.js";

export default createAgentChatPlugin({
  appId: "redstring",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { ...MCP_OPTIONS, externalAgents: { denyActions: mcpDenyActions(Object.keys(actionsRegistry)) } },
  initialToolNames: [...AGENT_TOOL_NAMES],
  frameworkTools: FRAMEWORK_TOOLS,
  // Spend guard, run before any model call: a message is one run against the person's daily
  // limit, a continuation is counted against its own looser limit (the browser sets that
  // marker, so it cannot exempt a request), and the kill switch stops everything. This covers
  // the chat panel only. Inbound A2A is refused in production unless an A2A secret is set, so
  // none is set; MCP's `ask_app` also runs the agent outside this hook (see docs/spike-results.md).
  prepareRequest: (details) => guardAgentRun(details),
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: SYSTEM_PROMPT,
});
