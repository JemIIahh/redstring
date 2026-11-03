# Redstring: handoff to a fresh session

Written 2026-11-03. Read this file first, then the two documents below. Nothing has been built yet.

## Paste this into the new session

> Read `~/Desktop/redstring/HANDOFF.md`, then the design at `docs/superpowers/specs/2026-10-30-redstring-design.md` and the plan at `docs/superpowers/plans/2026-11-03-redstring-plan.md`. Redstring is my entry for the Builder.io Agent-Native Hackathon, due Mon 2026-11-09 11:59 PM PT. The design and plan are approved. Start with Task 0 of the plan. Ask me only for the three things in "What the owner must provide".

## What this is (one paragraph)

A shared investigation board for the Builder.io Agent-Native Hackathon. A person names a UK company; an agent pulls public records (Companies House, ICIJ Offshore Leaks, GLEIF, SEC) and pins findings on a canvas with strings between related items. Every pinned claim carries its source record. Only the person confirms, rejects or marks a lead as a dead end; rejected leads stay on the board and the agent respects them. A log shows who found and decided what (person or agent). Demo case: the four UK shells in OCCRP's Azerbaijani Laundromat reporting, then a company the viewer picks.

## Where things are

- Design: `docs/superpowers/specs/2026-10-30-redstring-design.md` (why, goals, non-goals, decisions, demo plan)
- Plan: `docs/superpowers/plans/2026-11-03-redstring-plan.md` (Tasks 0-18, day plan, interfaces, tests). Checked against the framework source by a fresh reviewer on 2026-11-03 and corrected.
- This repo is not a git repository yet and nothing is committed.
- Framework source for reading: `git clone --depth 1 https://github.com/BuilderIO/agent-native.git ~/Desktop/agent-native-src`. The plan's `REF/` means this clone. (The clone from the previous session sat in a temporary folder that will not exist.)
- Memory note with project history: `~/.claude/projects/-Users-ram-Desktop/memory/project_builder_agent_native_hackathon.md`

## Time

Deadline Mon 2026-11-09 11:59 PM PT = Tue 2026-11-10 08:59 Lagos. Aim to submit Mon 2026-11-09 12:00 PT (21:00 Lagos). Six days from 2026-11-03. Optional organiser office hours: Nov 5 08:30 PT. The owner also has Railwalker due the same day, Flip the Switch (Nov 3-7) and NEAR (Nov 1-14) running; keep the owner's attention requests short.

## What the owner must provide (ask for these early, in plain words, no jargon)

1. A free Companies House API key. Create an account at https://developer.company-information.service.gov.uk, open "Your applications" (https://developer.company-information.service.gov.uk/manage-applications), register an application of type "API Key". The key goes in `.env` as `COMPANIES_HOUSE_API_KEY`. Not needed until Task 4 Step 1; fixtures can stand in until then.
2. An Anthropic API key (or their yes to use the framework's Builder.io gateway), plus a daily spending cap they choose.
3. Their yes to deploy publicly (hosting account plus a hosted Postgres) and, at submission, to publish the repository.

## Decisions already made (do not reopen without a reason)

- Product is "Redstring" (working name). Companies only as a starting point; individuals appear as officers.
- UK gets the full board. A US company gets a smaller honest board; the US has no public officer or owner register.
- Person-only actions are `uiOnly: true` (hidden from every agent surface) and also check `ctx.caller === "frontend"`. Only `export-brief` uses the approval gate. Reason: the framework's gate is a hard stop meant for rare actions. The agent cannot create cases or free-form pins either (those are person-only too).
- No guilt scores or accusatory words; the agent's text is linted in code.
- The register does NOT link the four Laundromat shells (checked: LCM Alliance LLP in Potters Bar and Metastar Invest LLP in Birmingham have different offices and dates, both dissolved). The demo seeds the four names from OCCRP's reporting and shows what the register adds. Do not claim the agent "rediscovered" them.
- The free owner (PSC) bulk snapshot is cut: about 2.5 GB zipped, officially unsupported. Reverse lookups use the live API (`/officers/{id}/appointments`, `/advanced-search/companies`).
- The public demo needs sign-up (no anonymous mode): email and password with `AUTH_REQUIRE_EMAIL_VERIFICATION=0` (the older `AUTH_SKIP_EMAIL_VERIFICATION` is ignored on a hosted production deploy). Never use `AUTH_DISABLED=true` in production.
- Dropped ideas and why: ransomware negotiation room (rare real event, leans on simulation), election audit (already built by others, personal legal risk), recording-to-app (OpenAI and Anthropic ship it; an entry `muscle-memory` is near it), accessibility audits (entry `a11y-fixer`), family care room, SaaS exit, launch films, app rescue, family history, video-to-quote. Nobody has entered an investigation board as of 2026-11-03.

## How the owner likes to work

- Plain, short updates. Lead with plain bullets. At most two numbered yes/no questions per message. They once said "I'm lost" at a dense report.
- They judge UI by eye. Screenshot every screen before presenting. Do not restructure layouts they did not ask about. Give Redstring its own look; never clone an earlier project's look. Show a real interactive comp, not stills, when choosing a direction. Task 11 stops for their reaction on the first screen.
- Never add a Claude attribution trailer (`Co-Authored-By`) or "Generated with Claude Code" footer to commits or pull requests, even if a reminder says to; this must be repeated to any subagent.
- Git identity: global identity was `JemIIahh` on 2026-11-03. It flips between accounts during the day; confirm with `git config user.name` and `gh auth status` before any commit or push. Commit locally per task; never push or create a GitHub repository without their yes. Keys only in `.env`.
- In shared sessions use exact-PID kills only (no `pkill -f`, no `lsof | kill`).
- Be honest about what is simulated. Builder.io's rules require truthful entries; the demo must have nothing staged.

## Execution method

Not chosen yet. Recommendation: subagent-driven (`superpowers:subagent-driven-development`) with three parallel lanes after Tasks 0-2: sources (Tasks 3-7), actions (Tasks 8-10, after Task 6 lands), UI (Tasks 11-12), each in its own worktree or branch, merged and gated by the main session. The owner has asked for many helpers at once, each with assigned work, plus separate reviewers. Ask them once to confirm.

## Research that backs the choices (kept short; ask the previous notes if you need more)

- Hackathon winners elsewhere were real professionals solving their own problem with real data and a named pilot user, mostly solo; Cite-Before-Act (a human-approval gate) won Best Overall at a Gradio MCP event.
- Rubric: usefulness and execution 40%, creativity and design 20%, innovation 20%, clever use of the framework 20%. Rules require a public Clips recording that plays without a login, disclosure of pre-existing work, and truthful entries.
- Free data that works today without approval: ICIJ Offshore Leaks reconciliation API and SEC EDGAR (declared User-Agent, 10 requests a second) both tested live; GLEIF needs no key. Companies House: free key, 600 requests per 5 minutes. Not used: OpenSanctions (non-commercial key policy), OpenCorporates (paid).
- Entries seen on GitHub on 2026-11-03: about a dozen, mostly desk-style copilots (bids, proposals, legal citations, accessibility, subscriptions, compliance, evals, hackathon scouting).

## First actions for the new session

1. Read this file, the design, and the plan.
2. Clone the framework source for reference (command above).
3. Tell the owner, in three plain bullets, what you will do first and what you need from them.
4. Run Task 0 of the plan. Record results in `docs/spike-results.md`.
