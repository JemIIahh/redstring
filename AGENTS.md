# Redstring — Agent Guide

Redstring is a shared investigation board. A person names a company; an agent pulls public records (Companies House, ICIJ Offshore Leaks, GLEIF, SEC) and pins what they show as cards and strings on a case wall; every claim carries its source; only the person confirms, rejects or marks a dead end. Cases live at `/cases` and `/case/:caseId`; `/case/sample` is an invented board for looking around.

## Rules that must keep holding

- **Provenance.** Every card and string has at least one https source row (record id, retrieved-at, content hash). Nothing is stored without one (`server/board/provenance.ts`).
- **The agent only proposes.** Anything the agent adds is `proposed`. Confirm, reject, dead end, notes, moving cards, creating a case, watching a company and answering a change or suggestion are the person's: those actions are `uiOnly` (the framework refuses a non-frontend caller) and are never agent tools. The agent's way to say "reject this" is `suggest-reject`, which never changes a status. `actions/agent-contract.test.ts` and `actions/person-actions.test.ts` fail if this slips.
- **Records, not people.** Agent-written text is linted for accusatory words (`server/board/language.ts`). Describe what a record says; never characterise a person or company. People who share a name are never merged; month and year of birth appear only in the sources panel, to tell them apart.
- **The brief.** `export-brief` is the only action that needs approval (`needsApproval: true`): the person's own Brief button is a proven UI call and runs directly; an agent, MCP, HTTP or A2A call pauses for the person. The brief copies no source excerpts (birth month and year live there), none of the agent's own words and no scores; it withholds birth dates typed into a person's reasons, escapes record text so a name cannot fake a citation, keeps unconfirmed items under their own heading and ends with the exact footer in `server/board/brief.ts`.
- **Say what was not read.** Coverage rows say `searched`, `no match`, `incomplete`, `not read` or `not available`. An empty result is "no match", never an error and never "clean".
- **Owner-scoped.** Every store query takes the owner's email; another owner's case reads as `case_not_found`.
- **Spend guards.** Daily caps per user (`server/usage/caps.ts`): Companies House calls, cases created, agent runs and agent continuations (`server/agent/run-guard.ts`), plus a kill switch. The browser's "this is a continuation" flag is not trusted (the framework calls it client-controlled), so continuations are counted too. The guard covers the chat panel only: never set `A2A_SECRET` or an A2A API key (production then refuses inbound A2A), keep every way into our agent closed to outside MCP clients, whatever their token (`MCP_OPTIONS.builtinCrossAppTools: false` and `mcpDenyActions`: outside agents get the four read tools only; `ask_app` and `ask-agent` would run the agent outside this guard, and `server/agent/mcp-surface.test.ts` fails if one comes back or the list grows, in the default and the full catalog), and know that a scheduled automation (`recheck-watches`, see `docs/demo-notes.md`) starts the agent loop directly, so neither the daily agent cap nor the kill switch sees its model use; the Anthropic console limit is the only hard stop for it. Keys are server-side only.

## Where things live

- `actions/` — one file per action. Agent-visible reads and proposals: `view-screen`, `get-board`, `list-cases`, `list-changes`, `search-entity`, `expand-node`, `check-leaks`, `suggest-reject`, `navigate-to-node`, `snapshot-watches`, `export-brief`. Person-only writes: `create-case`, `pin-item`, `set-status`, `annotate`, `move-node`, `review-change`, `review-suggestion`, `watch-entity`. Each exports a plain `xxxRun` handler plus the `defineAction` default; tests call the handler with a fake context.
- `server/board/` — store, provenance, language lint, observations, expansion, known-list check, `brief.ts` (the sourced brief), `wording.ts` (plain words shared by the screen and the brief). `server/sources/` — one client per register. `server/watch/` — snapshots and diffs. `server/usage/` — caps.
- `server/agent/config.ts` — the agent's starter tools, framework tools (all off, no raw database tool), and system prompt. `server/plugins/agent-chat.ts` wires them.
- `app/components/board/` — the wall (`BoardCanvas`, `NodeCard`, `StringEdge`) and the side panel (to review, sources, searched, patterns, activity, list check, status controls, watch button). `app/routes/cases._index.tsx`, `case.$caseId.tsx`. `app/fixtures/laundromat-board.ts` is the invented sample board.
- `DESIGN.md` is the visual contract (case wall: slate felt, paper cards, red thread). Read it before changing any board UI.

## Application state

- `navigation` is `{view: "case", caseId, nodeId?}` on `/case/:caseId?node=:nodeId`, `{view: "cases"}` on `/cases`, plus the template's views. `navigate-to-node` writes a `navigate` command the UI follows.
- `selection` is `{caseId, ids}` (card and string ids, nothing else); absent when nothing is selected. Call `view-screen` for both before acting.

## Checking work

- `pnpm typecheck && pnpm test && pnpm agent-native:doctor`. If the machine is busy, PGlite set-up can time out: `pnpm vitest --run --maxWorkers=4 --hookTimeout=60000`.
- UI changes: look at them in a real browser (`/case/sample` needs no key). Screenshot before presenting.
- Companies House needs `COMPANIES_HOUSE_API_KEY`; the agent needs an Anthropic key. Without them everything else still runs and says plainly what it could not do.

## Framework pointers

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`, `.agents/skills/agent-native-docs/SKILL.md`.

Local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action source-search --query "<pattern>"`. For external-agent integrations: `pnpm action docs-search --slug "external-agents"`.

Never fabricate. Report failures and recover; verify writes by reading the row or screen. Never hardcode credentials, webhook URLs or private data.
