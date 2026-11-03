# Submission: Builder.io Agent-Native Hackathon

**Status: DRAFT, NOT SUBMITTED.** Due Mon 2026-11-09 11:59 PM PT. Target: Mon 2026-11-09 12:00 PT (21:00 Lagos). Recording a clip alone does not submit an entry; submit the official form and confirm receipt. Fields in angle brackets are the owner's to fill; nothing below has been invented for them.

## Form fields

| Field | Value |
| --- | --- |
| First name | `<owner to confirm>` |
| Email | `<owner to fill: the address they want the organisers to use>` |
| Project name | Redstring |
| Public Clips URL | `<owner to record; open it in a private window to confirm it plays with no login>` |
| Repository URL (optional) | `<only after the owner says yes to publishing; remove .env and confirm no keys in history first>` |
| Slides (optional) | none |
| Rules checkbox | `<owner ticks it after reading the rules>` |

## Project description (paste-ready)

Redstring is a shared investigation board for public records. You name a company; an agent reads public registers and pins what they say as cards and strings on a wall. Every card and string carries its source: the register, the link, the record id and the date it was read. The agent only proposes. Only the person confirms, rejects or marks something a dead end, and the agent can suggest a rejection but never make one.

It is built to say what it could not find. A search with no match is shown as "no match", not as clean. A source that was cut short is marked incomplete and says why. Limited partnerships whose partners appear only in scanned filings are marked "not read". People who share a name are never merged. Agent-written text is checked for accusatory wording, and the brief it can export lists confirmed items first, cites every line, keeps unconfirmed items apart and ends: "Based on public records retrieved on the dates shown. Not a finding of wrongdoing."

How it uses Agent-Native: the screen and the agent share the same actions and data. Person-only actions (confirm, reject, notes, watching a company) are `uiOnly`, so the framework refuses any agent, MCP or HTTP caller. The brief export is the one action that needs approval when an agent calls it. Outside MCP clients can read boards through four read-only tools and cannot reach our agent.

Team: `<owner to fill: name, and whether solo>`. One builder working with coding agents.

## What is real and what is simulated

- **Live cases use real public data** from Companies House (UK), Offshore Leaks (ICIJ), GLEIF and SEC EDGAR, fetched when the case is created or expanded. Nothing in a live case is invented.
- **The sample board at `/case/sample` is invented.** Every company, person and address on it is made up (company numbers use the unissued OC9xxxxx range) and it is labelled "SAMPLE DATA" on screen and in any brief made from it. It exists so the app can be looked at without a registry key. It is not a case about anyone.
- **The demo case** takes the four shell company names from OCCRP's published Azerbaijani Laundromat reporting, typed in by hand, and shows only what the registers return for them, including the empty results.
- Not simulated, but not built: reading scanned partner lists, US officer data (the US has no public officer register), and Companies House's bulk owner snapshot.
- `<fill in at submission: whether the deployed app, the live agent and the live MCP connection were actually exercised, and on what date. Do not claim any of them before it has happened.>`

## Pre-existing work and tools disclosed

- The Agent-Native framework and its `chat` template (MIT licence). The first commit of the repository is the scaffold generated from that template plus a spike notes file; everything after it is new work for this hackathon.
- Public data sources: Companies House, ICIJ Offshore Leaks, GLEIF, SEC EDGAR, and OCCRP's published reporting (names read by hand from the page).
- No code reused from an earlier project.
- Built with Claude Code (AI coding assistant) writing most of the code under the owner's direction, with an independent AI review pass at the end.

## Honest limits to state if asked

- UK companies get the full board; US companies get SEC filings, GLEIF parent links and ICIJ candidates plus a note that the US has no public officer register.
- The registers do not link the demo shells to each other. The two checked have different offices and incorporation dates and are both dissolved; the links in OCCRP's story come from payment data and reporting, not from the register.
- Daily caps and a kill switch limit spend per visitor. A scheduled re-check, if enabled, bypasses the agent cap; the Anthropic console limit is the hard stop.

## Checklist before submitting

- [ ] Clips link plays in a private window.
- [ ] Description above matches what was actually demoed.
- [ ] Anything marked "not verified" in `docs/demo-script.md` is either verified or left out.
- [ ] Repository public only with the owner's yes; `.env` absent; no keys in git history (`git log -p | rg -i "sk-ant|api_key="` finds nothing).
- [ ] Form submitted and a receipt or confirmation seen.
