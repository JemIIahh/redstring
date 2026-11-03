import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import { AGENT_TOOL_NAMES, FRAMEWORK_TOOLS, SYSTEM_PROMPT } from "../agent/config.js";
import { guardAgentRun } from "../agent/run-guard.js";

export default createAgentChatPlugin({
  appId: "redstring",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: [...AGENT_TOOL_NAMES],
  frameworkTools: FRAMEWORK_TOOLS,
  // One fresh question is one run against the person's daily limit; a spent limit refuses
  // the turn before any model call.
  prepareRequest: (details) => guardAgentRun(details),
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: SYSTEM_PROMPT,
});
