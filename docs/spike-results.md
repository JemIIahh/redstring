# Task 0 spike results

Run 2026-11-03 against `@agent-native/core` as installed by `create --template chat` (local dev, `pnpm dev`, port 8080). Probes were Playwright scripts driving a local headless Chromium (throwaway, deleted).

Status: **partial.** Everything that does not need a language model is proven. Three items wait for the owner's Anthropic key (marked PENDING KEY). They are listed again at the bottom with exactly what to run.

## The five proofs

| # | Proof | Result |
|---|---|---|
| 1 | Person-only action (`uiOnly: true`) | **PASS** |
| 2 | Approval gate (`needsApproval: true`) | **PARTIAL.** UI call runs directly: PASS. Agent call pauses until approved: PENDING KEY |
| 3 | Screen awareness | **PASS** for selection -> `view-screen`. `navigate` moving the UI: PENDING KEY (agent call) |
| 4 | Scheduled run | PENDING KEY |
| 5 | MCP | **PARTIAL.** Auth wall confirmed, `/mcp` `tools/list` not read; see below |

### 1. Person-only action: PASS

- From the signed-in UI (`useActionMutation`) the action ran and `ctx.caller` was `"frontend"`.
- Same signed-in session, no UI marker header: refused with HTTP 403, `errorCode: "ui_capability_required"`.
- Not signed in: HTTP 401.
- Hidden from agents: `spike-person-only` is absent from `/.well-known/mcp.json` (the catalog of agent- and HTTP-exposed actions); `spike-gated` is present. Framework source: `isActionHiddenFromEveryAgentSurface` and `filterAgentTools` drop `uiOnly` actions from every agent surface. `defineAction` itself also throws `ui_only_action` (403) when `ctx.caller !== "frontend"`.
- Correction to the plan: the caller check does not rest on a bare client header. The route marks a call `frontend` only when it carries a browser-cookie session, same-origin evidence and the UI capability (`isProvenUiRequest` in `action-routes.ts`). A script running inside the person's own signed-in page can still call the action; that is the person acting. The agent runs in-process as `caller: "tool"` and never reaches this path.

### 2. Approval gate: PARTIAL

- UI button calling `spike-gated` (`needsApproval: true`): ran directly, `caller: "frontend"`. PASS.
- Agent-called pause and `approval_required`: PENDING KEY.

### 3. Screen awareness: PASS (selection)

- UI wrote application-state `selection` with `setClientAppState` from `@agent-native/core/client/hooks`.
- `pnpm action view-screen` (modified to include `selection`) returned the same object. PASS.
- `navigate` moving the browser: PENDING KEY.

### 4. Scheduled run: PENDING KEY

Needs a model to run the job prompt. Procedure is in the plan (Task 0 step 3.4).

### 5. MCP: PARTIAL

- `POST /mcp` (`initialize` and `tools/list`) on localhost returns `Unauthorized` and points to `npx @agent-native/core@latest connect http://localhost:8080` (OAuth). The plan said loopback needs no auth; that is wrong for this version.
- `GET /.well-known/mcp.json` works without a login and lists the actions that are exposed (about 110 of them, mostly framework actions; the person-only spike action is not in it).
- `tools/list` through an authenticated MCP client is not verified. Task 16 stays a stretch and starts with the `connect` command.

## Test and build tooling: PASS

- `@testing-library/react`, `happy-dom` (already present), `playwright` added. Component test under `// @vitest-environment happy-dom` passes.
- Playwright uses the cached Chromium at `~/Library/Caches/ms-playwright/chromium-1248/...` through `executablePath`; no browser download needed.
- `@xyflow/react` 12.12.1 added. A throwaway route rendered 2 nodes and 1 edge in the browser. `pnpm typecheck` passes.
- Sign-in for local development: the "Continue as local dev" button works under Playwright.

## Findings that change later tasks

1. **Task 13: shrink the agent's framework surface.** The catalog lists about 110 framework actions (sharing, org invites, provider-key policy, feature flags, audit export, and others). `createAgentChatPlugin` takes `frameworkTools: { ... }` (see `REF/packages/core/src/framework-tools.ts`) with a switch per group: `database`, `extensions`, `sharing`, `review`, `history`, `featureFlags`, `launchDarkly`, `labs`, `localization`, `audit`, `contextXray`, `userProfile`, `automation`, `docs`, `resources`, `browserSessions`, `web`, `workspaceApps`. Turn off every group the board does not need. Most important: the `database` group could let the agent write rows directly and bypass the provenance rules. Task 13's contract test must assert the agent's tool list contains no database tool. `automation` stays on only if the scheduled job needs it.
2. **Task 1: tests already get an in-memory database.** `vitest.config.ts` sets `DATABASE_URL: "pglite:memory"`. The plan's own `server/db/test-db.ts` helper is still fine.
3. **Task 16: MCP needs the OAuth `connect` step**, not loopback.
4. The `chat` template's own guide (`CLAUDE.md`, `AGENTS.md`) says to skip test suites; this project follows the plan's test-first steps instead.

## Fallback decisions

- Person-only: no fallback needed; "hidden from the agent" holds and stays in the demo.
- Scheduled run: keep the plan's fallback (a "Re-check now" button) in Task 14 regardless; the scheduled job is the optional extra until proof 4 passes.
- MCP: Task 16 stays a stretch, starting with the `connect` command; if the client cannot connect in one try, cut it.

## PENDING KEY: what to run when the Anthropic key arrives

1. Put `ANTHROPIC_API_KEY` in `.env`, restart `pnpm dev`, ask the agent to "call the hello action for Alex"; expected `Hello, Alex!`.
2. Recreate the spike actions (copies parked in the session scratchpad; each is under 20 lines): ask the agent to call `spike-gated`; expect `approval_required` and no run until approved. Check `spike-person-only` is not in the agent's tools.
3. With `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`, create a one-minute job whose prompt says "call the hello action for Alex"; confirm it fires or "Run now" works.
4. Select a node in the UI, ask the agent "what is selected?" and "go to that node"; expect the answer to name the node and the screen to move.
5. Append each result here and delete the spike actions again.
