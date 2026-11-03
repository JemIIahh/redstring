# Deploy notes

**Status: NOT DEPLOYED.** This is the checklist for Task 17. Nothing below has been run against a host. Deploying needs the owner's yes, an account on the host, a hosted Postgres and the keys listed here. Fill in the "Result" lines only with what was actually observed.

## Before the first deploy

1. **Template analytics and origins in `netlify.toml`.** The scaffold ships with `GA_MEASUREMENT_ID`, `GTM_CONTAINER_ID` and `BETTER_AUTH_TRUSTED_ORIGINS` (the template's own sites) set under `[build.environment]` / `[context.production.environment]`. They are the template's, not Redstring's. Remove the two analytics IDs, and replace the trusted origins with this deploy's own origin, before deploying: otherwise visitors' page views go to someone else's analytics property.
2. **Pick the host.** `netlify.toml` exists; there is no `vercel.json`. If Vercel: follow the framework's `vercel` guide and add `CRON_SECRET` only if the scheduled re-check is used (see `docs/demo-notes.md`).
3. **Create a hosted Postgres** in the owner's account. Set `DATABASE_URL` on the host.

## Environment variables (host settings, never committed)

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Hosted Postgres. |
| `BETTER_AUTH_SECRET` | Stable secret for sign-in sessions. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION=0` | Sign-up in under a minute with no email step. `AUTH_SKIP_EMAIL_VERIFICATION` is ignored on a hosted production deploy; do not rely on it. |
| `ANTHROPIC_API_KEY` | The agent. **Set a monthly spend limit in the Anthropic console first**: it is the only hard stop for the paths the in-app guard does not cover (see below). |
| `COMPANIES_HOUSE_API_KEY` | Free key from Companies House. |
| `REDSTRING_SEC_USER_AGENT` | A contact string for SEC requests. |
| `REDSTRING_CH_CALLS_PER_USER_DAY`, `REDSTRING_CH_CALLS_GLOBAL_DAY`, `REDSTRING_CASES_PER_USER_DAY`, `REDSTRING_AGENT_RUNS_PER_USER_DAY`, `REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY` | Daily caps (defaults in `.env.example`). |
| `REDSTRING_KILL_SWITCH` | Leave unset; set to `1` to stop new work. |

**Never set:** `AUTH_DISABLED`, `A2A_SECRET`, any A2A API key. Setting an A2A secret opens an inbound agent path that the daily cap and kill switch do not see.

## Release steps

1. `pnpm typecheck && pnpm vitest --run --maxWorkers=4 --hookTimeout=60000 --testTimeout=60000 && pnpm agent-native:doctor` is green on the commit being shipped.
2. `pnpm build` locally succeeds (not yet run for this checklist).
3. `pnpm migrate:production` against the hosted database (the Netlify build command already runs it in a production context).
4. Deploy per the host guide.

## Acceptance, in a private window

Record what you saw, with the date. Leave a line blank if it was not run.

- [ ] Sign up with email and password in under 60 seconds, no email step. Result:
- [ ] Create a case for a company you did not prepare; the board fills with sourced items. Result:
- [ ] The 11th case of the day is refused politely, with no partial writes. Result:
- [ ] `REDSTRING_KILL_SWITCH=1` stops new work with a plain message; unset it afterwards. Result:
- [ ] Inbound A2A is refused: the deployed agent card / A2A endpoint does not run the agent without a secret that is not set. Result:
- [ ] MCP `tools/list` against the deployed `/mcp` shows exactly `get-board`, `list-cases`, `list-changes`, `search-entity`. Result:
- [ ] `/case/sample` shows the SAMPLE DATA label. Result:
- [ ] No key appears in the page source, network responses, an activity row or an error message. Result:

If sign-up friction fails, fall back to the single published demo account described in the spec.

## Known limits to say out loud

- The in-app guard covers the chat panel. MCP `ask_app` / `ask-agent` are denied by `mcpDenyActions`; inbound A2A is closed by not setting a secret; a scheduled automation would bypass both the agent cap and the kill switch. The Anthropic console spend limit is the backstop.
- A signed-in user's own session can call the app's HTTP actions as themselves. That does not reach the Anthropic key.

## Live URL and results

- URL: _not deployed_
- Deployed on: _not deployed_
- Test results: _not run_
