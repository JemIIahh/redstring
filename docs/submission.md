# Submission: Builder.io Agent-Native Hackathon

**Status: DRAFT, NOT SUBMITTED.** Due Mon 2026-11-09 11:59 PM PT. Target: Mon 2026-11-09 12:00 PT (21:00 Lagos). Recording a clip alone does not submit an entry; submit the official form and confirm receipt. Fields in angle brackets are the owner's to fill; nothing below has been invented for them.

## Form fields

| Field | Value |
| --- | --- |
| First name | `<owner to confirm>` |
| Email | `<owner to fill: the address they want the organisers to use>` |
| Project name | Redstring |
| Project URL | https://redstring-frontend.vercel.app |
| Public Clips URL | `<pending upload/public sharing; current 62-second connected investigation film is Redstring-demo-v3.mp4; verify the final Clips link plays without login>` |
| Repository URL (optional) | https://github.com/JemIIahh/redstring (public, owner authorised 2026-11-08) |
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
- **The recorded demo case** starts with LCM ALLIANCE LLP (OC372263), selected from Companies House through the real UI. The live agent adds sourced register records and tentative Offshore Leaks name matches. The person confirms an address and rejects an unsupported identity match, then approves a sourced brief. No payment links or wrongdoing are inferred. A separate optional four-company example comes from OCCRP's published reporting.
- Not simulated, but not built: reading scanned partner lists, US officer data (the US has no public officer register), and Companies House's bulk owner snapshot.
- Hosted non-model acceptance passed on 2026-11-07: signup, real Companies House cases, saved decisions, brief download, owner isolation, daily case cap, kill switch and MCP/A2A restrictions. A real browser minted an MCP connection and verified the four permitted reads and agent-invocation refusal. Separately, genuine hosted DeepSeek research and browser approval passed during the authorized $1 recording window. The resulting case saved 15 proposed cards and eight strings; the person's subsequent decisions and downloaded brief persisted. Model access was paused after recording. Earlier deterministic source-action and offline fixture checks remain distinct from these real provider runs.
- Deployment is split: Vercel serves the frontend without server functions; Netlify runs the backend/auth/agent and hosts Postgres. Signup, existing-account access, saved cases, owner isolation, brief download and MCP event-stream transport passed through the Vercel frontend. All application secrets stay on Netlify.

## Pre-existing work and tools disclosed

- The Agent-Native framework and its `chat` template (MIT licence). The first commit of the repository is the scaffold generated from that template plus a spike notes file; everything after it is new work for this hackathon.
- Public data sources: Companies House, ICIJ Offshore Leaks, GLEIF, SEC EDGAR, and [OCCRP's core-company list](https://www.occrp.org/en/project/the-azerbaijani-laundromat/the-core-companies), checked on 2026-11-06.
- No code reused from an earlier project.
- Built with Claude Code writing most of the code under the owner's direction, followed by Codex review, DeepSeek setup, fixes, browser acceptance, release work and demo preparation. The application's agent uses DeepSeek's OpenAI-compatible API. The budgeted live recording is complete; paid access is now paused.
- Demo narration uses the open-source Kokoro-82M `af_heart` synthetic voice, generated locally with original Redstring text. Graphics and the synthesized score were created for this film; the ClimbX and Payday clips informed its presentation style. Register waits are visibly shortened; product interactions use the actual application.

## Honest limits to state if asked

- UK companies get the full board; US companies get SEC filings, GLEIF parent links and ICIJ candidates plus a note that the US has no public officer register.
- The registers do not link the demo shells to each other. The two checked have different offices and incorporation dates and are both dissolved; the links in OCCRP's story come from payment data and reporting, not from the register.
- Daily caps and a kill switch limit spend per visitor. A scheduled re-check would bypass the agent cap; keep it disabled until a provider-side spending backstop is verified for DeepSeek.

## Checklist before submitting

- [ ] Clips link plays in a private window.
- [ ] Description above matches what was actually demoed.
- [ ] Anything marked "not verified" in `docs/demo-script.md` is either verified or left out.
- [x] Owner authorised the public repository on 2026-11-08. Source files and 34 existing commits were scanned with Gitleaks; its one finding was a public LEI in a test fixture. Exact matching against six configured secret values across 393 historical blobs found no matches. `.env`, local account/session files, databases, deployment state and local recordings remain ignored.
- [ ] Form submitted and a receipt or confirmation seen.
