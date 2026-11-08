# Deploy notes

**Status: SPLIT DEPLOYMENT LIVE; HOSTED MODEL AND NON-MODEL FLOWS VERIFIED.** Public frontend: [redstring-frontend.vercel.app](https://redstring-frontend.vercel.app). Vercel serves the static UI and assets with **zero Vercel functions**. Backend API, authentication handlers, agent execution and Postgres remain on Netlify at `https://redstring-investigations.netlify.app`. Final backend deployment after recording: `6aef1b4dc6a77e1acefc6191`. Live DeepSeek research and browser approval passed on 2026-11-07 within the owner's $1 recording allowance. The key was then removed, both model caps restored to zero and a hosted chat probe returned 429. Registry work remains available with the kill switch at `0`. A recoverable initial React hydration warning remains documented below.

## Budgeted live recording (2026-11-07)

- The owner approved DeepSeek use and the proposed $1 total preparation/recording allowance. `server/agent/demo-budget.ts` composes the public engine factory's supported `requestFetch` option so automatic titles, ordinary turns and retries all reserve against the same owner-scoped Postgres counter before provider access.
- Set all four operator settings together: `REDSTRING_DEMO_OWNER_EMAIL`, `REDSTRING_DEMO_BUDGET_ID`, `REDSTRING_DEMO_BUDGET_MICRO_USD` (maximum `1000000`) and `REDSTRING_DEMO_EXPIRES_AT`. Partial/expired configuration, a different or absent verified owner, other endpoints/models, media and non-function provider tools fail closed. Output is clamped to 4,096 tokens and thinking is disabled for the recording.
- Reservations conservatively use Flash peak rates, double the serialized text payload bytes plus framing allowance, and the maximum allowed completion. Failed attempts keep their reservation. This is a request allowance, not an invoice. Keep the same id for retakes and across deployments; the counter does not reset at midnight. Source for the checked rates: [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).
- Netlify Free rejected function-specific environment scopes. The key used the backend project's default environment scope; no key was added to Vercel, and local builds continued to use inert placeholders with external requests blocked. No plan upgrade was made.
- The live agent expanded LCM ALLIANCE LLP (OC372263) and checked Offshore Leaks: 15 proposed cards and 8 proposed strings persisted. Companies House coverage showed two officers/members, an address and seven filings; Offshore Leaks coverage honestly showed 5 of 25 candidates and `incomplete`. The initial recording check read too early; later readback verified the completed writes without repeating the research request.
- A person confirmed the address and rejected BO ALLIANCE LLP as an unsupported identity match, recording a reason. Both decisions persisted. A separate genuine DeepSeek brief request showed the approval card; clicking Approve resumed and returned the sourced brief. The direct Brief button and downloaded citations/footer/rejection reason were checked again afterward.
- Final conservative reservations: **$0.293370 of $1.00**, with **$0.706630 remaining**. Direct provider balance lookup was unavailable, so no exact provider invoice amount is claimed. Paid access was then removed and verified paused; recurring jobs, A2A and outside agent invocation remain disabled.
- New guard tests and the full source suite passed: **444 passed, 1 skipped**; typecheck and framework doctor were clean. The backend build passed, and 1,078 generated text files contained zero configured credential/contact matches.
- Original live evidence/raw takes remain under `.tmp/demo-production/`. The current 62-second review cut is `Redstring-demo-v3.mp4` in the project root, with assets under `.tmp/demo-v3/`: a continuous original narration following the same case throughout, real app close-ups, explicitly shortened waits, a labelled styled excerpt of the actual brief, an original quiet score and local Kokoro `af_heart` narration using the owner’s Payday voice. Native word timestamps drive visual cues and sentence captions. This revision made no additional model calls. No public Clips URL or submission receipt exists yet.

## Frontend on Vercel; backend on Netlify

- Vercel project: `redstring-frontend`, in the existing `seunjeremiah2003-9938s-projects` account. Netlify project/database remain in the Redstring team (`jemiiahh`). No database was moved or recreated.
- `pnpm build:frontend` builds React Router in SPA mode in a fresh temporary directory containing only allowlisted source/config files. It does not copy `.env`, inherit application credentials, or allow external HTTP requests. Inert placeholders satisfy the shared compiler's server-config validation. The temporary prerender server/bundle is not deployed. Only `build/client` is copied into `.vercel/output/static`; there is no functions directory.
- Vercel's Build Output API configuration sends `/_agent-native`, `/api`, `/mcp`, `/a2a` and `/.well-known` to the fixed Netlify backend. Auth screens and their stable `auth-client.js` entry use the backend's matching build. Missing hashed auth assets and Netlify's injected platform script have explicit backend routes. Other existing static files are served by Vercel before the SPA fallback. See `scripts/frontend-routing.mjs`.
- API/auth responses explicitly disable rewrite caching. Browser API requests use the Vercel origin, so session cookies and UI capabilities stay on that domain. Netlify's `APP_URL` and `BETTER_AUTH_URL` point at the Vercel origin. `CORS_ALLOWED_ORIGINS` is that exact origin; `BETTER_AUTH_TRUSTED_ORIGINS` includes the frontend and backend origins. No wildcard origin was added.
- Old Netlify browser links for `/`, `/cases`, `/case/*`, `/home`, `/chat/*`, `/settings/*` and `/extensions/*` redirect to Vercel. Auth and protocol endpoints remain on Netlify for the proxy. A canceled Netlify publish was retried successfully; the old working backend stayed active during that retry.
- Frontend release: `pnpm build:frontend`, then `vercel deploy --prebuilt --prod` from the linked project. `vercel.json` selects the frontend-only build for future source builds. Never run `NITRO_PRESET=vercel pnpm build` for this architecture, and never copy the backend secrets to Vercel.
- Backend release stays `NITRO_PRESET=netlify pnpm build`, followed by the existing Netlify deployment command. Migrate Postgres only when schema changes require it.
- Split-host Playwright acceptance passed: Vercel document delivery, signup in 6,730 ms, healthy Netlify/Postgres through the rewrite, canonical auth origin, Vercel session cookies, person-only case creation, reload persistence, sourced brief/download, paused model use, an existing account and case from before the split, cross-owner refusal and private-response no-store behavior. Protocol checks passed with **`text/event-stream` MCP responses through Vercel**, exactly four read tools, agent-invocation refusal, A2A closure, Vercel resource discovery and old-Netlify-link redirects. These are transport checks, not a paid live-agent streaming run.
- Evidence: `.tmp/split-host/` screenshots, result JSON and downloaded brief. The frontend credential scan checked 450 generated text files and found zero configured credential/contact matches. Type checking, **428 tests passed / 1 skipped**, framework doctor and both builds passed.

The API initially supplied only `netlifydb_readonly`; the first migration stopped with `permission denied for schema public`. The owner enabled the database's personal-token write-access setting. The resulting `netlifydb_owner` connection was verified, the framework schema snapshot and all remaining framework migrations passed, and both Redstring migrations passed. The saved runtime connection was read back successfully. The owner has been asked to turn the temporary personal-token access setting off again; that final UI toggle is not yet verified.

The Netlify CLI token was exposed by an uncaught SDK diagnostic. The owner explicitly chose to continue using the existing connection; subsequent release requests catch errors and withhold sensitive diagnostics. This does not mean the token was rotated.

## Before the first deploy

1. **Template analytics and origins in `netlify.toml`: removed.** The scaffold shipped with the template's own Google Analytics and Tag Manager IDs and its own sites as trusted origins; they are deleted, so page views do not go to someone else's analytics. `AGENT_NATIVE_HOSTED_HARNESS=true` stays: it makes the hosted agent tools-only (no shell, file or code editing). Before deploying, if the host's URL is not inferred correctly for sign-in, set `BETTER_AUTH_URL` to it.
2. **Hosting is split.** `vercel.json` builds only the frontend; `netlify.toml` configures the backend. All server-side credentials and database configuration belong to Netlify.
3. **Create a hosted Postgres** in the owner's account. Set `DATABASE_URL` on the host.

## Environment variables (host settings, never committed)

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Hosted Postgres. |
| `BETTER_AUTH_SECRET` | Stable secret for sign-in sessions. |
| `APP_URL`, `BETTER_AUTH_URL` | `https://redstring-frontend.vercel.app`, the public browser/auth origin. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Exact frontend and backend origins, comma-separated. |
| `CORS_ALLOWED_ORIGINS` | Exact Vercel production origin; no wildcard. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION=0` | Sign-up in under a minute with no email step. `AUTH_SKIP_EMAIL_VERIFICATION` is ignored on a hosted production deploy; do not rely on it. |
| `OPENAI_API_KEY` | **Your DeepSeek key**, using the framework's OpenAI-compatible connection. Not an OpenAI key. |
| `OPENAI_BASE_URL` | `https://api.deepseek.com/v1` — keep this with the key so requests go to DeepSeek. |
| `AGENT_ENGINE` | `ai-sdk:openai` — the framework's compatible transport. |
| `AGENT_MODEL` | `deepseek-flash` — the default DeepSeek model. |
| `COMPANIES_HOUSE_API_KEY` | Free key from Companies House. |
| `REDSTRING_SEC_USER_AGENT` | A contact string for SEC requests. |
| `REDSTRING_CH_CALLS_PER_USER_DAY`, `REDSTRING_CH_CALLS_GLOBAL_DAY`, `REDSTRING_CASES_PER_USER_DAY`, `REDSTRING_AGENT_RUNS_PER_USER_DAY`, `REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY` | Daily caps (defaults in `.env.example`). |
| `REDSTRING_KILL_SWITCH` | Leave unset; set to `1` to stop new work. |

**Never set:** `AUTH_DISABLED`, `A2A_SECRET`, any A2A API key. Setting an A2A secret opens an inbound agent path that the daily cap and kill switch do not see.

Set all four DeepSeek variables in the host's **runtime** environment; the local `.env` is not uploaded. No Anthropic key is needed. The existing framework resolves scoped user/organization keys before the deployment fallback; do not copy the key into source or frontend settings. DeepSeek's [API guide](https://api-docs.deepseek.com/) documents the compatible endpoint and model IDs. Provider billing controls must be checked separately; an Anthropic console limit does not apply to DeepSeek. Leave scheduled automations disabled until a provider-side spending backstop is verified.

**Current cost hold:** After the budgeted recording, `OPENAI_API_KEY` is absent and both model caps are `0`. Scheduled automations and keep-warm remain disabled. The title-generation path bypasses the ordinary chat guard; the recording provider guard above covers it while configured, but removing the key remains the final pause. Any retake within the existing allowance must reuse its stable budget id and remaining balance.

When deploying a locally built bundle, explicitly save runtime safety settings on the host, including `AGENT_NATIVE_HOSTED_HARNESS=true` and `AGENT_NATIVE_RELEASE_MIGRATIONS=1`. Do not assume TOML build-context variables reach a manually uploaded function. Run the release migrations before setting the request-time migration bypass.

## Release steps

1. `pnpm typecheck && pnpm vitest --run --maxWorkers=4 --hookTimeout=60000 --testTimeout=60000 && pnpm agent-native:doctor` is green on the commit being shipped.
2. `NITRO_PRESET=netlify pnpm build` locally succeeds. **Passed again during release preparation**, with build-only placeholder database/model values and external HTTP requests blocked. Both client and Netlify server/function output were generated. Keep-warm was explicitly disabled. This did not initialize hosted Postgres. The earlier scan of 1,794 generated text/code files found none of the configured credential/contact values; repeat the scan on the final bundle.
3. `pnpm migrate:production` against the hosted database: **passed**, including `redstring-board-initial` and `redstring-coverage-per-company`.
4. Manual Netlify production deployment: **passed**; exact final deployment ID above. The final bundle contains only the `server` function. Set `AGENT_CHAT_DURABLE_BACKGROUND=0`, `AGENT_NATIVE_DISABLE_RECURRING_JOBS=1` and `AGENT_NATIVE_DISABLE_KEEP_WARM=1` in both the local build environment and host runtime. No scheduled function or background agent function is emitted. No A2A secret is configured.
5. Final generated-output scan: **1,076 text files, zero configured credential/contact matches**. Type checking, **428 passed / 1 skipped** source tests and framework doctor passed again before the final publish.

## Offline acceptance (2026-11-06)

`pnpm test:offline-ui` passed **12 browser checks** with simulated model/register responses and the real app approval transport, brief action and database. Approve/Deny rendering was inspected in screenshots. Deny prevented export; a fresh request asked again; Approve resumed and exported exactly once; the person's Brief button ran directly; citations/footer and exact download contents passed; the case and both export activity rows survived reload; no browser runtime errors occurred.

The runner uses a temporary workspace without `.env`, a fresh database and dummy credentials. Server and browser external requests are blocked. **Zero paid model calls** were made. Evidence lives in `.tmp/offline-ui/`; these tests do not replace hosted acceptance or a budgeted live-provider run. The source suite also passed **428 tests, 1 skipped**, with type checking and framework doctor clean.

## Acceptance, in a private window

Record what you saw, with the date. Leave a line blank if it was not run.

- [x] Sign up with email and password in under 60 seconds, no email step. Result: real UI signup reached Cases in 3,164 ms using a fresh QA account.
- [x] Create and reload a real company case. Result: TESCO PLC, 00445790, saved through the UI. The registered `expand-node` source action added an address and registered-at string as proposed; every card/string had complete HTTPS evidence. The person's UI confirmation persisted with person/frontend activity. The sourced brief downloaded exactly as displayed.
- [x] Hosted live-model board fill. Result: the budgeted DeepSeek request saved 15 proposed cards and eight proposed strings for LCM ALLIANCE LLP. This was a real provider run through the Vercel frontend and Netlify backend, separately from the earlier deterministic source-action test.
- [x] Hosted live-model approval. Result: the genuine brief approval card appeared; the person's Approve click resumed execution and returned the sourced brief. The direct UI download retained citations, the exact footer and the person's rejection reason.
- [x] The 11th case of the day is refused politely, with no partial writes. Result: ten QA cases persisted, the eleventh returned 429 with the daily-limit message, and the case count remained ten.
- [x] `REDSTRING_KILL_SWITCH=1` stops new work with a plain message; unset it afterwards. Result: new register search returned 429 while a saved case remained readable. After final publish with `0`, register search returned 200.
- [x] Inbound A2A is refused. Result: hosted `POST /_agent-native/a2a` returned 503 without its secret; no agent was invoked.
- [x] MCP `tools/list` against the deployed `/mcp` shows exactly four reads. Result: `get-board`, `list-cases`, `list-changes`, `search-entity`; `ask_app` refused. Production initially injected a fifth `tool-search` entry; explicitly denying it fixed the hosted regression and the unit fixture now includes that injected tool.
- [x] `/case/sample` shows the SAMPLE DATA label. Result: screenshot inspected.
- [x] Credential exposure checks. Result: configured values absent from the final generated bundle and rendered page. These bounded checks are not an exhaustive audit of every possible response.
- [x] Owner isolation. Result: a second signed-in owner received `case_not_found`/404 and had an empty case list; anonymous access returned 401.
- [x] Zero-spend guard. Result: ordinary chat and client-marked continuation requests both returned 429 before model use. The deployed DeepSeek key is absent.

If sign-up friction fails, fall back to the single published demo account described in the spec.

## Known limits to say out loud

- The in-app guard covers the chat panel. MCP `ask_app` / `ask-agent` are denied by `mcpDenyActions`; inbound A2A is closed by not setting a secret; a scheduled automation would bypass both the agent cap and the kill switch. Keep automations disabled until a provider-side spending backstop is verified for DeepSeek.
- A signed-in user's own session can call the app's HTTP actions as themselves. That does not expose the DeepSeek key.
- React reports a recoverable hydration error (#418) on initial loads. The UI recovers, and the functional flows above passed. Its cause has not been established. Netlify's optional badge is injected at the edge; an attempt to disable it was refused by this account's API with `Removing the Netlify badge is not available on this plan`. No upgrade or branding workaround was applied.

## Live URL and results

- Public frontend: https://redstring-frontend.vercel.app
- Backend: https://redstring-investigations.netlify.app
- Backend deployment after recording and model pause: `6aef1b4dc6a77e1acefc6191`, 2026-11-07; the public frontend verified paused chat (429). Frontend deployment: `dpl_9uws7eR7LkutuD9c4xus3T2HB3YU`, production alias `https://redstring-frontend.vercel.app`. Final-bundle browser readback passed: person-only confirmation persisted after reload and the sourced brief still exported. Protocol checks passed again against that deployment. Recoverable React #418 warnings remain as described above.
- Evidence: `.tmp/hosted/` screenshots/results and exact downloaded `brief.md`; private release state and QA sessions are in ignored `.deploy-tmp/` (directory mode 0700). No credential is included in these notes.
