# Demo notes

Things to know when showing Redstring, and what has and has not been checked against the real registers.

## Watching a company and re-checking it

- **Start.** Select a UK company card and choose **Watch for changes** (only UK companies, because changes are read from Companies House by company number). The first check records a starting point and finds nothing; later checks compare with it.
- **See what is waiting.** The **Review** button on the toolbar counts everything waiting for an answer: cards the agent pinned (Confirm or Open), its suggestions to look again (Accept or Dismiss), and changes found on watched companies (Accept or Dismiss). Accepting a change or a suggestion only marks it as seen; it never alters a card. Rejecting is done on the card, where a reason is asked for.
- **Re-check now** (in the Review panel, shown only when a company is watched) runs `snapshot-watches` from the screen. It says what it read, what it could not read and where it stopped; it never says "nothing new" for a company it did not read. It uses the same daily Companies House limit as everything else.
- **"No changes since <date>"** is shown only when a watched company was really read on that date. With no watch it says nothing is watched; with a watch that has never been read it says "Not checked yet".
- The sample board (`/case/sample`) has one invented watch and change so the queue can be clicked through. Its answers live in memory and are gone on reload.

## Scheduled re-check (optional, NOT created, NOT run live)

The brief called for a scheduled job named `recheck-watches`. It has not been created, for two reasons that are the owner's to decide:

1. A scheduled run uses the creator's own Anthropic key. There is none yet.
2. **A scheduled run bypasses our spend guard.** The framework runs automations through its background runner, which starts the agent loop directly; `prepareRequest` (where `server/agent/run-guard.ts` counts runs and honours the kill switch) is not on that path. The Companies House calls the job makes are still capped and still stop on the kill switch (they go through `assertWithinCaps`), but the model tokens are limited only by the schedule and by the Anthropic console limit. Enable it once, daily at most, and only after setting a monthly limit in the Anthropic console.

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

## Not checked against the real registers yet

- No Companies House key has been configured, so no real company has been watched or re-checked; everything above is covered by tests against stand-in registers and a browser run of the sample board.
- Real daily snapshot baseline started: **not yet.** When a key exists, watch the demo companies and write the start date here, so "no changes since" has a real history behind it.
