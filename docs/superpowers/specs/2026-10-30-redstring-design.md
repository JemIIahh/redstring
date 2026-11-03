# Redstring: design

Working name. Written 2026-10-30 for the Builder.io Agent-Native Hackathon.
Status: awaiting owner approval. Nothing has been built.

## Intent

A shared investigation board where a person and an agent work on the same
case. The person names a company (individuals enter the board as officers and
owners of companies). The agent pulls public
records and pins what it finds on a canvas, with a string between related
items. Every pinned claim carries the record it came from. The person drags,
confirms, rejects ("false lead") and says "go deeper here"; the agent re-plans
from those calls. A rejected lead stays on the board as a recorded dead end
and is never silently retried.

Why this and not a chatbot: investigation is judgement-heavy and iterative.
The person has context the records don't (this is the same-name stranger;
that address is a known mail drop). The agent has stamina the person doesn't
(follow every officer, every filing, every shared address). The product is
the loop between them, with proof attached at every step.

## Who it is for

- Investigative journalists and NGO researchers asking "who is behind this
  company?" (the main users; they also qualify for the free data).
- Due-diligence and compliance analysts doing the same check on a counterparty.
- Anyone curious about a company, which is also what lets a hackathon judge
  try it in thirty seconds.

How often the job happens is inferred from vendor material. We found no
first-hand investigator testimony. Treat "weekly" as unverified.

## Goals

1. Real: type any UK company name and get a sourced board in about a minute,
   with no hard-coded case. US companies get a smaller, honest board (see
   "Resolved after the builder check").
2. Shared: the person and the agent use the same actions on the same data.
   Anything one can do on the board, the other can do.
3. Person in control: confirm, reject, pin, annotate, "go deeper here" on a
   specific item. The agent always knows which item "this" means.
4. Provenance by construction: no pin without a source (enforced in the
   action's schema, not the prompt). Each node and edge stores source URL,
   record id, retrieved-at time, a content hash, who added it (person or
   agent) and its status.
5. A sourced brief: one export where every sentence cites its records and
   unconfirmed items are marked as such.
6. Watching: a scheduled agent re-checks watched entities and puts changes
   (new officer, new filing, address change) in a review queue for the person.
7. Claude can query the board over MCP (stretch).
8. A documented demo: rebuild the OCCRP "Azerbaijani Laundromat" UK shell
   network from Companies House, checkable against OCCRP's published list of
   core companies, then run it live on a company the judge picks.

## Non-goals

- No guilt scoring, risk scores or "suspicious" labels. The board states what
  records say and shows counts (for example "11 companies share this address").
- No sanctions-screening or compliance-determination product claims.
- No login-walled sites, no scraping against terms, no social-media profiling,
  no private individuals beyond what a public company register lists.
- No paid data in v1. No multi-tenant SaaS, billing or team admin.

## Anti-goals (would make it a failure even if it runs)

- A board that looks impressive but holds unsourced or invented claims.
- The agent presenting a guess as a fact, or merging two people with the same
  name without the person deciding.
- Accusatory wording. A defamation problem is worse than a missing feature.
- A demo that only works on one pre-baked company.
- Hiding what it could not find. Empty results and unreadable scans are shown.

## Constraints

- Must be built with the Agent-Native framework (MIT, v0.222.x checked in
  source). The UI and the agent must share actions and data.
- Deadline: Mon 2026-11-09 11:59 PM PT, which is Tue 2026-11-10 08:59 in
  Lagos. Written with ten days to go; on 2026-11-03 about six days remain.
  One builder plus coding agents.
- Submission needs a public Clips recording that plays without a login, a
  project description naming the team and any pre-existing work, and the
  official form. A deployed app is encouraged, not required; we want one
  anyway because "the judge types their own company" is the heart of the demo.
- Rules require truthful entries and disclosure of pre-existing work.
  Disclose the framework, the data sources and any reused code.
- The rubric: usefulness and execution 40%, creativity and design 20%,
  innovation 20%, clever use of Agent-Native 20%. Rankings are provisional
  until framework use is verified.
- The owner judges UI by eye. Screenshot every screen before presenting it,
  do not rework layouts that were not asked about, and give this project its
  own look rather than reusing the look of an earlier project.

## Data sources (checked 2026-10-30)

Used in v1:
- UK Companies House API: officers, persons with significant control, filings.
  Free key, no approval, 600 requests per 5 minutes. Needs an owner account.
- ICIJ Offshore Leaks reconciliation API: no key. Tested live. Fuzzy name
  match; treat results as candidates, never as confirmed matches.
- GLEIF (legal entity identifiers): no key; responded without one.
- SEC EDGAR: no key, 10 requests a second, must send a declared User-Agent.
  Tested live.
- OCCRP Azerbaijani Laundromat pages and the published payments data as the
  answer key for the demo case (the raw-data URL redirected; resolve it at
  build time).

Not used:
- OpenSanctions: API keys go only to journalists, NGOs and academics, and bulk
  data is non-commercial. Leave out of v1; revisit only if the owner qualifies.
- OpenCorporates: paid from about £2,250 a year. CourtListener: 5 requests a
  minute and 125 a day, so optional and off by default.

Known gaps to show honestly in the product:
- Some UK limited partnerships list their partners only in scanned filings.
  Two of the four demo shells are like this. Reading a scan with a vision model
  is a stretch goal, and anything read that way is marked "read from scan,
  verify".
- ICIJ returned no hits for the demo shells. Show that as a null result.

## Design decisions (my calls, not agreed with the owner)

Board data model, stored in SQL through the framework's database layer:
- Node: company, person, address, filing or document. Fields: type, display
  name, status (proposed, confirmed, rejected, dead-end), reason (required
  for rejected and dead-end), added-by (person or agent), created-at.
- Edge: type taken from the record, not invented (officer-of, member-of,
  controls, registered-at, same-address), plus status and added-by.
- Evidence: source name, URL, record id, retrieved-at, content hash. A node or
  edge without at least one evidence row cannot be created.
- Case: groups nodes, the watch list and the activity log.

Actions (each one is a framework action used by the UI, the agent, and MCP):
search-entity, get-company, get-officers, get-persons-with-control,
check-leaks, expand-node, pin (node or edge, evidence required), set-status,
annotate, ask-deeper (a person's instruction attached to one node),
watch-entity, review-change, export-brief, view-screen, navigate-to-node.

Who may do what:
- The agent may pin items as "proposed" and may suggest rejecting one.
- Only a person confirms, rejects or marks a dead end. Corrected 2026-11-03
  after reading the framework docs: the approval gate is a hard stop meant for
  rare outward-facing actions, so it is the wrong tool here. Instead the
  person-only actions are marked `uiOnly: true`, which hides them from every
  agent surface, and also refuse any call whose caller is not the browser UI.
  The agent cannot even see them. The caller check alone is weak (it rests on a
  client header); the real boundary is that the agent never receives the tool.
  Beyond confirm, reject and dead-end, creating a case, free-form pins,
  annotations, moves, change reviews and watches are also person-only (builder's
  call: they spend quota or record the person's own judgement).
- Exporting a brief is outward-facing, so it keeps the approval gate
  (`needsApproval`): an agent-initiated export pauses until the person approves;
  the person's own button runs directly.
- Every action is logged with its caller, which gives the "who found what,
  who decided what" ledger.

Screen awareness: the UI writes the selected node ids and the current view to
the framework's application state. The agent reads them before acting, so "dig
into this one" works, and it can move the person's screen to a lead it wants
reviewed.

Rejected leads: stored with a reason. Later searches skip them and say how many
were skipped, so the person can see the agent respected the call.

Pattern observations (shared address, shared officer across companies) are
computed in code from stored records and shown as counts with links. They are
not model opinions.

Brief export: Markdown or PDF. Each sentence cites record ids. Unconfirmed
items are in a separate section. Footer: based on public records retrieved on
the stated dates; not a finding of wrongdoing.

Model: Claude through the framework's agent runtime. Keep the model call behind
the framework's engine setting so the key or provider can change.

Starting point: the framework's chat template with a custom canvas UI, unless
the builder finds a closer fit. Local database for development, hosted
Postgres for the deployed demo.

## Demo plan (the public Clips recording, about three minutes)

1. Seed the case with the four shells named in OCCRP's published reporting,
   and say so on screen. The registry does not link them: the two we checked
   (LCM Alliance LLP in Potters Bar, Metastar Invest LLP in Birmingham) have
   different registered offices and incorporation dates, and both are
   dissolved. The links in the published story come from payment data and
   reporting, not from the register.
2. The board fills in live from the register: members (LCM's are two Seychelles
   companies), filings, addresses. Show the ICIJ null result and the
   scanned-partners limit on screen, in plain words. Show any cross-links the
   register and the owner snapshot really support, and say plainly if there
   are none.
3. The agent proposes candidates that are real fuzzy matches (the ICIJ
   reconciliation API returns low-score candidates, and name searches return
   same-name strangers). The person rejects one with a reason. The agent
   adjusts and reports the dead end. Nothing here is staged.
4. Compare the board with OCCRP's published core-company list.
5. Hand over to a company the viewer or a judge chooses, live.
6. Open the activity log: who found what, who decided what.
7. Close on a watched company and a Claude question over MCP: "what changed
   this week?"

## Resolved after the builder check (all my calls, flagged for the owner)

1. US scope. UK gets the full board. A US company gets what US public records
   can honestly give: SEC filings for public registrants, GLEIF parent links,
   ICIJ candidates, and an explicit "the US has no public officer or owner
   register" note. The judge-picks-a-company step works best with a UK company,
   and the on-screen note says so. Parsing insider forms and ownership exhibits
   is out of v1.
2. Linking the Laundromat shells. Verified 2026-10-30: the register does not
   link LCM and Metastar (different offices and dates, both dissolved). The
   demo therefore seeds all four names from OCCRP's reporting and shows what
   the register adds. Reverse lookups are done through the live API, not bulk
   data: `/officers/{officer_id}/appointments` lists everything one officer is
   appointed to, and `/advanced-search/companies` matches by location. Measured
   2026-11-03: the free owner (PSC) snapshot is 33 zip parts of 79-82 MB, about
   2.5 GB zipped, and Companies House says it is "provided free of charge and
   will not be supported". It is cut from v1. If the register shows no
   cross-links for these four, the demo says so rather than inventing any.
   OCCRP's own pages blocked my automated read (HTTP 403), so the four names and
   numbers must be taken by hand from the published page. The payments data
   could add a "paid" edge type; check its terms of use before using it.
3. The same-name stranger comes from real data (ICIJ low-score candidates,
   Companies House name search). No staged stranger.
4. "What changed" in the finale. Take a baseline snapshot of a real watched
   company early (day 2), poll later, and show the real diff. If nothing
   changed, the board says "no changes since <date>". No back-dating.
5. Public deployment. Each visitor gets a private case in their own account.
   There is no shared board. Cap LLM spend and Companies House calls per
   visitor and per day, cache registry responses, and keep a kill switch.
   Corrected 2026-11-03: the framework has no anonymous mode. Production uses
   Better Auth sign-up (magic link when email is configured, otherwise email and
   password), and `AUTH_DISABLED=true` would make every visitor one shared user,
   so it is not allowed. The demo therefore uses email and password sign-up with
   `AUTH_REQUIRE_EMAIL_VERIFICATION=0` so a judge is in within seconds.
   (`AUTH_SKIP_EMAIL_VERIFICATION` is ignored on a hosted production deploy when
   an email provider is configured; the plan's reviewer found this in
   `src/app-config/auth.ts`.) Fallback if that fails in the first deploy test:
   one published demo account.
6. Cut order if time runs short, last cut first: core board with enforced
   sources and the approval gates, then the review queue and sourced brief,
   then watching, then MCP, then reading scanned filings. If MCP slips, the
   finale is the in-app "what changed" view. Which Claude client and whether
   the MCP server runs locally are the builder's call; a local server is fine
   for the recording.
7. People. A case starts from a company only. Officers appear with name, role,
   appointment dates and nationality. Month and year of birth is stored for
   telling same-name people apart and shown only in the evidence panel, never
   in exports. No residential addresses. No person-first search in v1.
8. Framework check. Done in the source on 2026-10-30: the approval gate takes a
   yes/no or a function and refuses when the function errors, the caller types
   include agent tool, frontend, MCP, agent-to-agent and automation, and the
   docs describe the application-state, view-screen and navigate pattern,
   scheduled jobs and MCP. Nothing has been run end to end, so the first task
   is a spike that proves: agent tool call waits for approval, selected-node
   state reaches the agent, a scheduled job runs, and a local MCP server
   answers.

## Left to the builder

Visual design of the canvas, the graph layout library, exact action names and
schemas, the review-queue layout, how deep each expansion goes by default,
hosting target, test strategy, and the order of work inside the ten days.

## Needed from the owner (only they can provide)

- A free Companies House API key (account in their name).
- An LLM key, or approval to use the framework's hosted gateway, and a
  spending cap for judge traffic (my default proposal: a hard daily cap that
  the owner sets; the app stops answering new cases when it is reached).
- Approval to deploy publicly and to publish the repository at submission.
- A hosting account (Vercel or Netlify) and a hosted Postgres database for the
  public demo. Local development needs neither.
