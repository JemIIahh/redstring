import { defineAction } from "@agent-native/core/action";
import { readAppState, readAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

export async function viewScreenRun() {
  const navigation = await readAppState("navigation");
  const selection = await readAppStateForCurrentTab("selection");

  const screen: Record<string, unknown> = {};
  if (navigation) screen.navigation = navigation;

  const nav = navigation as { view?: unknown; caseId?: unknown } | undefined;
  if (nav?.view === "case" && typeof nav.caseId === "string") {
    screen.openCaseId = nav.caseId;
    const selected = selection as { caseId?: unknown; ids?: unknown } | null;
    if (selected?.caseId === nav.caseId && Array.isArray(selected.ids)) {
      const ids = selected.ids.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ids.length > 0) screen.selection = { caseId: nav.caseId, ids };
    }
  }

  if (Object.keys(screen).length === 0) {
    return "No application state found. Is the app running?";
  }
  return screen;
}

export default defineAction({
  description:
    "Read the app's current screen: navigation, the open case id, and the items the person has selected. Call this before acting so that 'this one' means the selected item.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: viewScreenRun,
});
