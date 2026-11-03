# Demo script (about three minutes)

**Status: DRAFT.** Nothing here has been recorded. Every step marked **needs key** only works once the Companies House key (and, for the agent, the Anthropic key) are set; until then the steps can be rehearsed on `/case/sample`, which is invented data and says so. Do not record the sample board as if it were a real case.

## Before pressing record (owner)

- Signed in on the deployed app in a private window, or `pnpm dev` locally with the keys in `.env`.
- The demo case is seeded: the four shell companies named in OCCRP's published Azerbaijani Laundromat reporting, entered by hand from that page (OCCRP blocked automated reads), with the OCCRP page pinned as their source (`pin-item`, source `occrp`). **needs key**
- Expansions have been run once so the board is filled, so the recording shows the live fill of one more company, not a long wait.
- One real company pinned and watched at least a day earlier, so the watch step shows a real "since" date. If no check has run, say so on screen (see step 7).
- A phone-free, notification-free screen. Browser at 100%.

## Beats

| Time | On screen | Say (plain, short) |
| --- | --- | --- |
| 0:00 | Cases page, the seeded case open | "Redstring is a shared investigation board. I name a company; an agent pulls public records and pins them as cards. Every card says where it came from. I decide what counts." |
| 0:15 | The four shells on the wall, the OCCRP card | "These four names come from OCCRP's published reporting. I typed them in. The registers do not link them: the two I checked have different offices and dates, and both are dissolved. The links in the story come from payment data and reporting, not from the register." |
| 0:40 | Select a company card and use "Ask the agent to go further on this". Cards drop in as **proposed** (dashed), strings in red | "The agent only proposes. Nothing it adds is settled until I confirm it." **needs key** |
| 1:00 | Open **Searched** | "This panel says what was and was not read. Offshore Leaks returned no match for these companies: that is a null result, not a clean bill. And these two are limited partnerships whose partners are only in scanned filings, so they say 'not read'. Nothing is invented." |
| 1:20 | A proposed same-name candidate (ICIJ candidate or a same-name officer). Open its sources, then **Reject** with a reason | "A near match is not the same person. Birth month and year differ, so I reject it and say why. The agent can suggest a rejection; only I can make it." |
| 1:45 | **Check list** against the OCCRP core-company list | "I can compare the board with OCCRP's published list. A name that is missing from the list says nothing about the company." |
| 2:00 | Type a company the viewer or a judge picks (UK) into the chat; the board fills | "Now a company you choose." **needs key** If it is a US company, say: "The US has no public officer register, so this board will be thinner, and it says why." |
| 2:30 | **Activity** | "Who found what and who decided what, in order. The agent's proposals and my decisions are different rows." |
| 2:45 | **Review**, then **Brief** → Make brief | "Watched companies show real changes since their last check, or 'no changes since <date>', or 'not checked yet'. The brief lists confirmed items first, every line cited, unconfirmed items kept apart, and ends: 'Not a finding of wrongdoing.'" |
| 3:00 | Stop | |

## If a step cannot be shown honestly

- No real change on a watched company: say "No changes since <date>" and show the date. Do not back-date a check and do not stage a change.
- A source was slow or limited: show the **incomplete** row in Searched and say what was cut short.
- The agent is unavailable (no key, daily limit, kill switch): show the plain stop message; it is part of the product.
- Claude-over-MCP step ("what changed this week?"): only include it if it was run live at least once beforehand (`docs/mcp-demo.md`). It is not verified yet; leave it out otherwise.

## Words to avoid on camera

Do not call any person or company a criminal, fraudulent or guilty, and do not say the register "proves" a link it does not show. Describe what a record says. Say "public records", "proposed", "confirmed by me", "not read".

## After recording

Open the Clips link in a private window and confirm it plays with no login. Recording a clip alone does not submit the entry.
