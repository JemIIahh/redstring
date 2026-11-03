import {
  appBasePath,
  appPathFromLocalRoute,
} from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import {
  chatThreadPath,
  HOME_PATH,
  isChatPathname,
  NEW_CHAT_PATH,
  threadIdFromPath,
} from "@/lib/chat-paths";
import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view?: string;
  path?: string;
  publicPath?: string;
  threadId?: string;
  /** The open case, on /case/:caseId. */
  caseId?: string;
  /** The node the address points at (?node=), when there is one. */
  nodeId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname, searchParams }) =>
      navigationStateForPath(pathname, searchParams),
    getCommandPath: commandPathForNavigation,
  });
}

export function commandPathForNavigation(command: NavigationState): string {
  const fallbackPath = pathForCommand(command);
  const path = typeof command?.path === "string" ? command.path : "";
  if (!path) return fallbackPath;

  const basePath = appBasePath();
  if (!basePath) return path;

  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
  const publicPath =
    typeof command?.publicPath === "string" ? command.publicPath : "";
  const publicPathSuffixIndex = publicPath.search(/[?#]/);
  const declaredPublicPath =
    publicPathSuffixIndex === -1
      ? publicPath
      : publicPath.slice(0, publicPathSuffixIndex);
  const publicViewPath = appPathFromLocalRoute(pathForView(command?.view));
  if (
    matchesPathPrefix(pathname, basePath) &&
    (matchesPathPrefix(pathname, publicViewPath) ||
      (declaredPublicPath && declaredPublicPath === pathname))
  ) {
    return `${pathname.slice(basePath.length) || "/"}${suffix}`;
  }
  return path;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const CASE_PATH = /^\/case\/([^/]+)\/?$/;

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The case id in /case/:caseId, or undefined on any other path. */
function caseIdFromPath(pathname: string): string | undefined {
  const m = CASE_PATH.exec(pathname);
  return m ? decodeSegment(m[1]!) || undefined : undefined;
}

export function navigationStateForPath(
  pathname: string,
  searchParams?: URLSearchParams,
): NavigationState {
  const threadId = threadIdFromPath(pathname);
  const caseId = caseIdFromPath(pathname);
  const nodeId = caseId ? searchParams?.get("node")?.trim() : undefined;
  return {
    view: viewForPath(pathname),
    path: pathname,
    publicPath: appPathFromLocalRoute(pathname),
    ...(threadId ? { threadId } : {}),
    ...(caseId ? { caseId } : {}),
    ...(nodeId ? { nodeId } : {}),
  };
}

function viewForPath(pathname: string): string {
  if (isChatPathname(pathname)) return "chat";
  if (pathname === CASES_PATH) return "cases";
  if (caseIdFromPath(pathname)) return "case";
  if (pathname === HOME_PATH) return "home";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/team")) return "settings";
  return "chat";
}

const CASES_PATH = "/cases";

function pathForView(view?: string): string {
  switch (view) {
    case "cases":
    case "case":
      return CASES_PATH;
    case "chat":
    case "ask":
      return NEW_CHAT_PATH;
    case "home":
      return HOME_PATH;
    case "database":
      return "/database";
    case "extensions":
      return "/extensions";
    case "observability":
      return "/observability";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/settings";
    case "team":
      return "/settings/organization";
    default:
      return HOME_PATH;
  }
}

export function pathForCommand(command: any): string {
  if (command?.view === "case") {
    const caseId = typeof command.caseId === "string" ? command.caseId.trim() : "";
    if (!caseId) return CASES_PATH;
    const nodeId = typeof command.nodeId === "string" ? command.nodeId.trim() : "";
    const base = `/case/${encodeURIComponent(caseId)}`;
    return nodeId ? `${base}?node=${encodeURIComponent(nodeId)}` : base;
  }
  const path = pathForView(command?.view);
  if (command?.view !== "chat" && command?.view !== "ask") return path;
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  return threadId ? chatThreadPath(threadId) : path;
}
