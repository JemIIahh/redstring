import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

export async function viewScreenRun() {
  const navigation = await readAppState("navigation");
  const selection = await readAppState("selection");

  const screen: Record<string, unknown> = {};
  if (navigation) screen.navigation = navigation;
  if (selection) screen.selection = selection;

  const nav = navigation as { view?: unknown; caseId?: unknown } | undefined;
  if (nav?.view === "case" && typeof nav.caseId === "string") {
    screen.openCaseId = nav.caseId;
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
