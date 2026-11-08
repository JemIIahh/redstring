# Demo notes

Things to know when showing Redstring, and what has and has not been checked against the real registers.

## Watching a company and re-checking it

- **Start.** Select a UK company card and choose **Watch for changes** (only UK companies, because changes are read from Companies House by company number). The first check records a starting point and finds nothing; later checks compare with it.
- **See what is waiting.** The **Review** button on the toolbar counts everything waiting for an answer: cards the agent pinned (Confirm or Open), its suggestions to look again (Accept or Dismiss), and changes found on watched companies (Accept or Dismiss). Accepting a change or a suggestion only marks it as seen; it never alters a card. Rejecting is done on the card, where a reason is asked for.
- **Re-check now** (in the Review panel, shown only when a company is watched) runs `snapshot-watches` from the screen. It says what it read, what it could not read and where it stopped; it never says "nothing new" for a company it did not read. It uses the same daily Companies House limit as everything else.
- **"No changes since <date>"** is shown only when a watched company was really read on that date. With no watch it says nothing is watched; with a watch that has never been read it says "Not checked yet".
- The sample board (`/case/sample`) has one invented watch and change so the queue can be clicked through. Its answers live in memory and are gone on reload.

## The brief

- **Brief** on the toolbar opens a panel: **Make brief** writes the case up as markdown, shows it, and **Download .md** saves exactly that text. Findings are only what the person confirmed, each line ending in `[E<n>]` that points at a numbered source (record, address, date retrieved). Proposed items sit under **Unconfirmed**; rejected and dead-end items sit under **Ruled out** with the person's reasons; **What was searched** says what was not read. A confirmed string that joins a card still only proposed says so on the line.
- It never contains month and year of birth, source excerpts, or anything the agent wrote.
- On a real case the button calls `export-brief`, which leaves a line in Activity. If the agent is asked for a brief it pauses and asks the person first; nothing leaves the app until they say yes. On the sample board the brief is built on the spot from what is on screen.
- A brief on screen is dropped the moment a card or string changes, so an out-of-date one is never downloaded.
- The live DeepSeek API run emitted an `approval_required` event (2026-11-06). The real approval card and deny/approve/resume flow then passed simulated-provider Playwright acceptance. On 2026-11-07, the approved $1 recording window also verified the genuine hosted DeepSeek approval round-trip: the card appeared, the person clicked Approve, and the sourced brief returned. The direct Brief button, citations/footer, rejection reason, exact download and saved decisions were checked again. The production key was removed afterward.

## Scheduled re-check (optional, NOT created, NOT run live)

The brief called for a scheduled job named `recheck-watches`. It has not been created, for two reasons that are the owner's to decide:

1. A scheduled run needs a model credential available to its creator. Redstring now uses DeepSeek, configured through the framework's OpenAI-compatible engine. The key is saved and works for interactive chat; scheduled execution has not been tested.
2. **A scheduled run bypasses our spend guard.** The framework runs automations through its background runner, which starts the agent loop directly; `prepareRequest` (where `server/agent/run-guard.ts` counts runs and honours the kill switch) is not on that path. The Companies House calls the job makes are still capped and still stop on the kill switch (they go through `takeUsage`), but the model tokens are not covered by the in-app agent caps. Keep the schedule disabled until a provider-side spending backstop is verified for DeepSeek; an Anthropic console limit does not protect these calls. If enabled later, run daily at most.

To create it later, open **Settings › Automations**, create a **Scheduled** automation named `recheck-watches`, run as its creator, with a daily cron (`0 7 * * *`) and this body. (The chat cannot create it: the framework's automation tools are off for the agent.)

```
---
schedule: "0 7 * * *"
enabled: true
runAs: creator
---

# Re-check watched companies

Call snapshot-watches. If it says it stopped early or could not read a company, say so.
Then call list-cases, and for every case that has watched companies call list-changes.
Summarise in a few sentences what is new, naming the company and the case.
Describe what the records say, never people. If list-changes gives no date for a case,
say nothing has been read yet for it; never say there are no changes without a date.
```

A scheduled run has no open screen, so the prompt walks the cases instead of "the open case".

To make it fire:

- **Locally:** start the app with `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`.
- **On Vercel:** set `CRON_SECRET` for production; the platform's cron calls the app with it.
- **Test it once** with **Run now** on the Automations screen before trusting the schedule.

## Watch baseline still pending

- The Companies House key is configured. A real no-match search was verified on 2026-11-06; a live watch/re-check was not part of that API run.
- Real daily snapshot baseline started: **not recorded.** Watch the demo companies and write the observed start date here, so "no changes since" has a real history behind it.

## Hosted release evidence (2026-11-07)

- The public frontend is now `https://redstring-frontend.vercel.app`; the backend/auth/agent and Postgres remain on Netlify. The original single-host QA signup took about three seconds; split-host signup took 6,730 ms with no email step. Both used the actual UI.
- TESCO PLC (00445790) was searched and selected through the UI, saved and reloaded. A direct call to the registered `expand-node` action read its actual address and added a proposed address card and registered-at string, with complete HTTPS provenance. This was deterministic source-action verification, not a live model run.
- Confirming the proposed address through its UI controls persisted a person/frontend decision. The person's Brief button produced citations and the exact required footer; the downloaded file matched the displayed text.
- A second signed-in account received `case_not_found` for the QA case and an empty case list; an anonymous read was refused. Ten QA cases saved; the eleventh was refused with HTTP 429 and left no partial case.
- The enabled kill switch blocked new register searches while the existing case remained readable. A2A returned 503 without its secret. The live MCP catalog returned exactly four read tools after the discovery-tool fix.
- The initial hosted acceptance used no model calls. The later, separately authorized $1 recording window verified genuine DeepSeek research (15 proposed cards, eight strings) and the browser brief approval round-trip. Conservative reservations totalled $0.293370; this is not the provider invoice. The production key was removed afterward, both model caps restored to zero and hosted chat returned 429.
- A recoverable React hydration error (#418) appears on initial page loads; the UI recovers and the functional flows above passed. Its cause is not established. Netlify injects a branding badge into this Free-plan site; the API refused disabling it with `Removing the Netlify badge is not available on this plan`. No plan upgrade or source-level workaround was applied.
