# Task 0 spike results

Run 2026-11-03 against `@agent-native/core` as installed by `create --template chat` (local dev, `pnpm dev`, port 8080). Probes were Playwright scripts driving a local headless Chromium (throwaway, deleted).

Status: **partial.** The original spike below ran on 2026-11-03. DeepSeek is now connected, and the live API checks below supersede the old PENDING KEY results where stated. Full browser acceptance remains pending.

**Provider update (2026-11-06):** The local configuration selects `ai-sdk:openai` with `deepseek-flash` and `https://api.deepseek.com/v1`. The owner saved the DeepSeek key; authenticated model discovery returned HTTP 200 and listed the configured model. No key value was displayed. Setup is documented in `docs/deploy-notes.md`.

## Live DeepSeek API checks (2026-11-06)

The app ran on `127.0.0.1:8091` with a separate database at `.tmp/live-agent-db`, because an existing process owned the normal development database. No existing case was used or changed. The final API run passed 17 assertions; the full automated suite passed **428 tests, 1 skipped**, with type checking and `agent-native:doctor` also passing.

- **Real model and app tools: PASS.** A request through the app's actual chat endpoint streamed a DeepSeek reply, called `view-screen`, and correctly asked for a case when no screen state existed.
- **Person-only actions: PASS at the HTTP boundary.** An authenticated ordinary HTTP caller was refused with 403 for create, pin, status, annotation, movement, watching, and reviewing changes and suggestions. An unauthenticated list-cases request returned 401.
- **Model decision boundary: PASS in the isolated empty case store.** Asked to confirm/reject directly or use a database, DeepSeek declined, said those decisions belong to the person, and did not invoke a person-only action. It also reported that the synthetic case id was not a readable case.
- **Brief approval pause: PASS at the API boundary.** Asked to invoke `export-brief` with a test case id, the live model produced an `approval_required` event. It was not approved and no brief was generated. This does not prove rendering or answering the approval card, or the generated brief for a real case.
- **No-match handling: PASS against Companies House.** A random single-token company query returned HTTP 200, zero hits and the normal `no matches` note.
- **Tab selection: bug found, fixed, and rechecked live.** Synthetic tab A navigation and selection, plus a conflicting legacy shared selection from tab B, initially made `view-screen` combine case A with tab B's card. Selection now uses the requesting tab only, the UI hook no longer writes or clears the shared key, and selections from a different case are withheld. The live tool returned A's case and A's card after the fix. Regression tests cover conflicting tabs, no selection in the current tab, and a stale selection from another case. Temporary screen state was deleted and read back as absent.
- **Secrets: PASS for the inspected chat response.** Configured credential/contact values were absent from that response. This is not a browser/network/log-wide credential audit.

**At the end of the API phase:** browser-driven case creation, real sourced expansion and verification of all persisted card/string evidence, live board refresh and navigation, approval-card rendering and approve/deny/resume, and live cap/kill-switch acceptance remained pending. The follow-ups below record subsequent progress. Scheduled automations remain disabled; deployment and live external MCP/OAuth acceptance remain separate work.

### Browser follow-up and cost stop (2026-11-06)

After the owner authorized Playwright, local-dev sign-in and UI case creation passed. The isolated case `28c20509-f622-4382-8d9e-ed5f1101b6c7` starts from Companies House company `OC372263` (LCM ALLIANCE LLP). Its starting card has complete HTTPS provenance. A full officers/controllers/address request encountered Companies House timeouts; the model reported those limits and added no invented records. An address-only request then added one proposed address card and one proposed registered-at string, updated the board without a manual refresh, and navigated to the address card. Screenshots were saved under `.tmp/critical-current.png` and `.tmp/critical-board.png`.

The owner raised a cost concern before the brief approval UI tests began. **Live testing was stopped:** the Playwright process and isolated development server were shut down. No further paid provider calls are authorized without an agreed budget. Use existing evidence and offline tests meanwhile. Approval-card deny/approve/resume, successful officers/controllers retrieval, full evidence verification after reload, and live cap/kill-switch checks remain unfinished.

An offline query of the isolated database's usage ledger recorded **11 chat entries**, all `deepseek-flash`: **317,408 input tokens, including 292,992 cached input tokens, and 6,145 output tokens**. These are app-recorded token counts, not a verified DeepSeek invoice; ancillary requests may not be represented. Do not claim a dollar charge from the framework's generic cost estimate.

### Offline approval UI and production build (2026-11-06)

The owner authorized completing offline acceptance and the production build, with no further paid model use. Added `pnpm test:offline-ui`, a repeatable Playwright test that copies working tracked sources into a temporary workspace without hidden files or `.env`, uses a fresh PGlite database and dummy credentials, intercepts model/register requests in-process, and blocks all other external HTTP/fetch and browser traffic. Model responses are fixtures; the application's approval UI, transport, action, database and brief are real.

**12 browser checks passed:** UI case creation; approval before any export activity; Deny with no export; a fresh approval after denial; Approve/resume/export exactly once; the person's direct Brief button; source citation and exact footer; download identical to displayed Markdown; case and export activity persistence after reload; no browser runtime errors; model replies served by fixtures; and absence of `.env` from the test workspace. Screenshots of the pending and completed approval were inspected. Results and screenshots are in `.tmp/offline-ui/`. Zero paid model requests were made.

`NITRO_PRESET=netlify pnpm build` also passed using build-only placeholder database/auth configuration and an external-request blocker. The output includes the production client and Netlify server/function bundles. No hosted database was contacted and no production migration or deployment occurred. A scan of 1,794 generated code/text files found none of the configured credential/contact values. Type checking, **428 source tests (1 skipped)** and framework doctor passed.

Approval UI, deterministic brief export/download, and fixture persistence are now verified offline. Still outstanding: successful live officers/controllers retrieval after the observed timeouts, full live card/string evidence verification after reload, hosted signup/cap/kill-switch/security acceptance, hosting/database setup, demo and submission. Further live model testing still needs an agreed owner budget.

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

## Browser checks to finish with the saved DeepSeek key

1. Keep the DeepSeek key in `OPENAI_API_KEY` in `.env`, with `OPENAI_BASE_URL=https://api.deepseek.com/v1`, `AGENT_ENGINE=ai-sdk:openai` and `AGENT_MODEL=deepseek-flash`. In the browser, ask the agent to "list my cases" (`list-cases`; the template's `hello` action was removed in Task 13); expected the list of cases.
2. On a real case, ask the agent to export a brief; expect an approval card and no export until approved. Check that confirming or rejecting a card remains person-only.
3. Optional, only after verifying a DeepSeek spending backstop: with `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`, create a temporary one-minute job whose prompt says "list my cases"; confirm it fires or "Run now" works, then disable it. Otherwise leave scheduling untested and disabled.
4. Select a node in the UI, ask the agent "what is selected?" and "go to that node"; expect the answer to name the node and the screen to move.
5. Append each observed result here.

## Task 13: agent instructions and tool surface (2026-11-03)

Verified (tests, `actions/agent-contract.test.ts` and `server/agent/run-guard.test.ts`):

- The tool list the agent receives excludes `create-case`, `pin-item`, `set-status`, `annotate`, `move-node`, `review-change`, `review-suggestion` and `watch-entity`. Checked against the registry the way the framework builds it (`actionsToEngineTools`, then `filterInitialEngineTools` with the starter names). Five mutations (a person-only action handed over as a starter tool, framework tools left at their defaults, a prompt rule dropped, `set-status` made agent-callable, a barred word in the prompt) each failed the matching test.
- `frameworkTools: "minimal"`: the database tool is off, extensions are off, and every framework group is off. The framework source confirms the effect: groups are subtracted from the agent's registry "from every downstream agent surface at once" (`agent-chat-plugin.js`, `filterFrameworkToolGroups`), while HTTP routes stay reachable so framework screens keep working.
- The agent-run cap: `prepareRequest` runs `guardAgentRun`. A message is one run against the daily limit (20 by default); a request that says it is a continuation is counted against its own limit (ten times the run limit, `REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY`), because the framework itself calls that marker client-controlled and an exemption on it would let anyone skip the cap; only the server's own background worker (marker set from server context, not the request body) is uncounted, and the kill switch applies to it too. A spent limit refuses with a 429 and "Daily limit reached. Try again tomorrow." A request with no signed-in owner is refused with a 401.
- The template's `hello` demo action was removed; it was exposed to the agent for no reason.

Spend paths the chat guard does not cover (found by the automatic security review of this task):

- **Inbound A2A.** In production the framework answers 503 when neither `A2A_SECRET` nor an A2A API key is configured, so it never runs the agent unauthenticated; in local development it does run (with a warning), which spends nothing but the local key. Rule: do not set `A2A_SECRET` or an A2A API key on the deployment. Task 17 must check with a request to the deployed A2A endpoint that it is refused.
- **MCP `ask_app`.** The built-in cross-app tool runs the app's own agent loop outside `prepareRequest`. **Resolved in Task 16: it is turned off** (`MCP_OPTIONS.builtinCrossAppTools: false` in `server/agent/config.ts`, plus `mcpDenyActions` for `ask-agent` and every non-read action, which matters for full-catalog tokens); `server/agent/mcp-surface.test.ts` runs the framework's real MCP builder over our actions and pins the outside tool list to the four read tools. Scheduled automations remain disabled until a provider-side spending backstop is verified for DeepSeek (see `docs/demo-notes.md`).

`/.well-known/mcp.json` still lists 134 actions. That file is the catalog of HTTP-exposed actions (for the signed-in person's own session), which the framework deliberately leaves ungated; it is not what an MCP client is offered. Task 16 checked the real `tools/list` in-process (four read tools, nothing else); a live client over the network is not yet checked (see `docs/mcp-demo.md`).

NOT done in the browser: Step 5 (select a real node, ask "dig into this one", watch the board fill and the screen move to the first lead; ask the agent to confirm a lead and see it decline and suggest). DeepSeek, Companies House and the SEC contact are configured. The live API checks above prove selected parts of the model's behaviour; they do not replace this full browser workflow.
