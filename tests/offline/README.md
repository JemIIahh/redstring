# Offline approval acceptance

Run `pnpm test:offline-ui` with the already-installed Playwright Chromium.

The runner copies the working source files listed by git to a temporary workspace,
omits hidden files (including `.env`), shares installed dependencies, and starts a
fresh PGlite database on localhost port 8094. It uses an explicitly constructed
environment with dummy model/register credentials. Your development database and
saved provider keys are not used.

The test-only Node preload answers model and Companies House requests with fixed,
invented records. It never forwards external requests, rejects unexpected model
credentials, and blocks other external HTTP/fetch traffic. Playwright also blocks
browser requests outside the local test app. Model output is simulated; the app's
approval transport, action, database, brief generation and download are real.

Checks cover the approval pause, Deny without export, a fresh request after Deny,
Approve and resume exactly once, the person's direct Brief button, citations and
footer, exact download contents, persistence after reload and browser errors.

Screenshots, network-fixture evidence, results and server logs are written to
`.tmp/offline-ui/`. An offline fixture failure does not authorize a live-provider
fallback. This does not replace a budgeted live-model check or hosted acceptance.
