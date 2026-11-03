# Redstring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared investigation board where a person and an agent build a sourced map of a UK company from public records, with every claim linked to its record and every decision logged as person or agent.

**Architecture:** An Agent-Native app started from the framework's `chat` template, with a domain database (cases, nodes, edges, evidence, activity, coverage), small source clients for Companies House, ICIJ Offshore Leaks, GLEIF and SEC, and a React canvas. The agent acts only through typed actions. Provenance and the person-only decisions are enforced in code, not in prompts.

**Tech Stack:** Node 22.22+, pnpm, TypeScript, `@agent-native/core` 0.222.x, Drizzle with PGlite locally and Postgres when deployed, zod, vitest, React Router (file routes), `@xyflow/react` for the canvas (verify it installs in Task 0).

**Spec:** `docs/superpowers/specs/2026-10-30-redstring-design.md`. Read it first; this plan cites its section names.

**Framework source for reference (read-only):** `git clone --depth 1 https://github.com/BuilderIO/agent-native.git ~/Desktop/agent-native-src`. Paths below that start with `REF/` mean that clone. Docs are in `REF/packages/core/docs/content/*.mdx`. Patterns are copied from `REF/templates/chat` and `REF/templates/tasks`.

**Commits:** Commit locally per task. Use the repo's local git identity (check `git config user.name`; it was `JemIIahh` on 2026-11-03), never add a Claude attribution trailer or footer, and never push or create a GitHub repository without the owner's yes.

**Verification history:** This plan was checked against the framework source on 2026-11-03 by a fresh reviewer; its corrections are folded in. Where a step still says "verify", the fact was not checkable offline.

## Global Constraints

- Node `>=22.22`; pnpm available (`corepack enable` if not).
- Built with the Agent-Native framework; the UI and the agent share the same actions and data.
- Deadline Mon 2026-11-09 11:59 PM PT (Tue 2026-11-10 08:59 Lagos). Target submission Mon 2026-11-09 12:00 PT (21:00 Lagos).
- A case starts from a company only. UK gets the full board; a US company gets SEC filings, GLEIF links, ICIJ candidates and the coverage note `The US has no public officer or owner register.`
- No pin without at least one evidence row: source, URL, record id, retrieved-at, content hash.
- The agent may only create items with status `proposed`. Only a person sets `confirmed`, `rejected` or `dead-end`; `rejected` and `dead-end` need a reason. These and the other person-only actions (Task 9) are `uiOnly` and also check `ctx.caller === "frontend"`.
- No guilt scores, risk scores or words like "suspicious". Edge types come from the record kind, never invented. The agent's own wording is linted; names and fields copied from a record are not.
- Same-name people are never merged automatically; a person node is keyed by the register's officer id, not the name.
- Month and year of birth is stored for telling people apart and shown only in the evidence panel, never in exports. No residential addresses.
- Brief footer, exact text: `Based on public records retrieved on the dates shown. Not a finding of wrongdoing.`
- No OpenSanctions, OpenCorporates or bulk owner snapshot in v1. No scraping of login-walled sites.
- Env names: `COMPANIES_HOUSE_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_REQUIRE_EMAIL_VERIFICATION` (set to `0` on the demo), `REDSTRING_SEC_USER_AGENT` (the owner's contact string; without it the US path degrades with a coverage note), `REDSTRING_KILL_SWITCH`, `REDSTRING_CH_CALLS_PER_USER_DAY` (default 300), `REDSTRING_CH_CALLS_GLOBAL_DAY` (default 2500), `REDSTRING_CASES_PER_USER_DAY` (default 10), `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS` (local only, `1`), `CRON_SECRET` (Vercel production only). Keys live in `.env` (git-ignored), never in code or logs.
- Companies House allows 600 requests per 5 minutes; this app budgets 500 across all users. Reaching the limit returns HTTP 429 until the window ends, and repeated abuse can get the key banned.
- Every screen is screenshotted and shown to the owner before it is called done; do not rework layouts the owner did not ask about; give Redstring its own look, not a copy of an earlier project.

## Review Focus

Failure modes the spec implies that no feature task would otherwise test; each has a test in the named task.

1. Name search returns nothing, many matches, or only dissolved companies: show a pick list, never auto-pick (Task 7, Task 11).
2. Registry rate limit or timeout in the middle of an expansion: keep what was pinned, mark that source `incomplete` in coverage and say why (Task 4, Task 7).
3. Two officers with the same name: separate nodes, no merge (Task 7).
4. A very large company (hundreds of officers or filings): capped at 50 per list with "showing 50 of N" (Task 4, Task 7).
5. The agent tries an unsourced pin, a person-only action, or accusatory wording in its own text: refused with a typed error and an activity row (Task 2, Task 8, Task 9).
6. A visitor hits a daily cap, the shared Companies House budget, or the kill switch: friendly stop, no partial writes (Task 6).
7. A limited partnership whose partners are not in the register data (this is the case for two Laundromat shells): coverage says "not read", nothing is invented (Task 7).

---

## Day plan (6 days left on 2026-11-03)

| Day | Tasks |
|---|---|
| 1 (Nov 3-4) | 0, 1, 2 |
| 2 (Nov 4-5) | 3, 4, 5, 6, 7; start Task 10's real baseline before the day ends |
| 3 (Nov 5-6) | 8, 9, 10, 11 (owner sees the first screen). Office hours Nov 5 08:30 PT: ask whether a hosted app is expected |
| 4 (Nov 6-7) | 12, 13, 14 |
| 5 (Nov 7-8) | 15, 17; 16 only if time |
| 6 (Nov 8-9) | 18, buffer |

Parallel lanes once Tasks 0-2 are done: sources (3-5, then 6, 7) | actions (8-10) | UI (11-12). Task 6 must land before Task 8. Cut order if late: Task 16 (MCP), then the scheduled job in Task 14 (keep the "Re-check now" button), never Tasks 2, 8, 9.

---

### Task 0: Scaffold and framework spike

**Files:**
- Create: the app at `~/Desktop/redstring` (merged with the existing `docs/` and `HANDOFF.md`), `docs/spike-results.md`, `.env`, `.env.example`
- Test: `spike/*.spec.ts` (throwaway; deleted at the end of the task)

**Interfaces:**
- Produces: a running app (`pnpm dev`) and `docs/spike-results.md` with one pass/fail line per proof below plus the fallback used.

- [ ] **Step 1: Scaffold.** From `~/Desktop` run `npx --yes @agent-native/core@latest create redstring-tmp --standalone --template chat` (the command refuses an existing directory, and it runs its own `git init` and commit inside `redstring-tmp`). Move everything from `redstring-tmp` into `~/Desktop/redstring` **except its `.git` directory**, without overwriting `docs/` or `HANDOFF.md`; the template's `_gitignore` becomes `.gitignore`. Then `cd ~/Desktop/redstring && corepack enable && pnpm install && pnpm add @electric-sql/pglite@^0.5.8`.
- [ ] **Step 2: Run it.** `pnpm dev`; choose "Continue as local dev"; confirm the chat page loads. Add `ANTHROPIC_API_KEY` to `.env` (or connect via "Use Builder.io"); ask the agent to "call the hello action for Alex"; expected reply `Hello, Alex!`.
- [ ] **Step 3: Prove five primitives**, recording each in `docs/spike-results.md`:
  1. *Person-only action:* an action with `uiOnly: true` (hides it from every agent surface) is absent from the agent's tools, works from the UI with `useActionMutation`, and throws when `ctx?.caller !== "frontend"`. Note that the caller check rests on a client header; the real boundary is that the agent never receives the tool.
  2. *Approval gate:* an action with `needsApproval: true` called by the agent emits `approval_required` and does not run until approved; the same action from a UI button runs directly.
  3. *Screen awareness:* a value written to application state `selection` from the UI is returned by `view-screen` to the agent; `navigate` moves the UI.
  4. *Scheduled run:* with `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1` set, create a job through the `manage-jobs` or `manage-automations` tool (jobs are database resources at `jobs/<name>.md`, not repo files; see `recurring-jobs.mdx` and `agent-resources.mdx`) whose prompt says "call the hello action for Alex", on a one-minute cron. Confirm it fires, or that "Run now" does. Note that a job body is an agent prompt, so it can only call actions.
  5. *MCP:* the default `/mcp` `tools/list` shows only actions with `mcpTool: true`; `/.well-known/mcp.json` is a separate catalog of HTTP-enabled actions. Confirm both with `curl`.
- [ ] **Step 4: Test and screenshot tooling.** Add dev dependencies `@testing-library/react`, `happy-dom` and `playwright` (the chat template has none of them). Component specs start with `// @vitest-environment happy-dom` (see `REF/templates/chat/app/routes/home.spec.tsx`). Add `@xyflow/react`, render one node in a throwaway route, and confirm `pnpm typecheck` passes.
- [ ] **Step 5: Decide fallbacks** in the results file: person-only proof fails -> keep the caller check and drop "hidden from the agent" from the demo; scheduled run fails -> "Re-check now" button only; MCP fails -> Task 16 is cut.
- [ ] **Step 6: Clean and commit.** Delete `spike/`, run `pnpm typecheck && pnpm test`, `git init` in `~/Desktop/redstring`, set the local identity, commit "chore: scaffold from chat template; spike results".

### Task 1: Data model and store

**Files:**
- Create: `server/db/schema.ts`, `server/db/index.ts`, `server/db/migrations.ts`, `server/plugins/db.ts`, `server/board/types.ts`, `server/board/store.ts`, `server/db/test-db.ts`
- Test: `server/board/store.test.ts`

**Interfaces:**
- Produces (types, in `server/board/types.ts`):
  - `NodeType = "company" | "person" | "address" | "document"`; `EdgeType = "officer-of" | "member-of" | "controls" | "registered-at" | "same-address" | "candidate-match"`; `Status = "proposed" | "confirmed" | "rejected" | "dead-end"`; `Actor = "person" | "agent"`
  - `EvidenceInput { source: "companies-house" | "icij" | "gleif" | "sec" | "occrp" | "manual"; url: string; recordId: string; retrievedAt: string; contentHash: string; excerpt?: string }` and `EvidenceRow extends EvidenceInput { id: string }`
  - `Case { id: string; ownerEmail: string; title: string; createdAt: string }`
  - `BoardNode { id; caseId; type: NodeType; key: string; label: string; facts: Record<string, string>; status: Status; reason?: string; addedBy: Actor; x?: number; y?: number; evidence: EvidenceRow[]; createdAt: string }`
  - `BoardEdge { id; caseId; type: EdgeType; fromId: string; toId: string; status: Status; reason?: string; addedBy: Actor; evidence: EvidenceRow[] }`
  - `ActivityRow { id; caseId; actor: Actor; caller: string; kind: string; targetId?: string; detail?: string; at: string }`
  - `CoverageRow { source: string; state: "searched" | "no_match" | "incomplete" | "not_read" | "not_available"; note: string }`
  - `Suggestion { id; targetId: string; reason: string; status: "open" | "accepted" | "dismissed" }`
  - `Change { id; caseId; watchId: string; kind: "officers" | "controllers" | "filings"; summary: string; status: "pending" | "accepted" | "dismissed"; createdAt: string }`
  - `Board { nodes: BoardNode[]; edges: BoardEdge[]; activity: ActivityRow[]; coverage: CoverageRow[]; suggestions: Suggestion[]; changes: Change[] }`
  - `Observation { kind: "shared-address" | "shared-officer"; count: number; nodeIds: string[]; evidenceIds: string[] }`
- Produces (store; every function takes `ownerEmail` and scopes every query by it):
  - `createCase(ownerEmail: string, title: string): Promise<Case>`
  - `pinNode(i: { caseId: string; ownerEmail: string; type: NodeType; key: string; label: string; facts: Record<string, string>; evidence: EvidenceInput[]; actor: Actor; status?: Status }): Promise<BoardNode>` (idempotent on `caseId + type + key`; a repeat pin adds evidence only)
  - `pinEdge(i: { caseId: string; ownerEmail: string; type: EdgeType; fromId: string; toId: string; evidence: EvidenceInput[]; actor: Actor }): Promise<BoardEdge>`
  - `setStatus(i: { caseId: string; ownerEmail: string; targetKind: "node" | "edge"; targetId: string; to: Status; reason?: string; actor: Actor }): Promise<void>`
  - `moveNode(caseId: string, ownerEmail: string, nodeId: string, x: number, y: number): Promise<void>`
  - `setCoverage(caseId: string, ownerEmail: string, row: CoverageRow): Promise<void>` (upsert by source)
  - `addSuggestion(caseId: string, ownerEmail: string, targetId: string, reason: string): Promise<Suggestion>`
  - `addChange(ownerEmail: string, c: Omit<Change, "id" | "createdAt" | "status">): Promise<Change>`
  - `listBoard(caseId: string, ownerEmail: string): Promise<Board>`
  - `logActivity(i: { caseId: string; ownerEmail: string; actor: Actor; caller: string; kind: string; targetId?: string; detail?: string }): Promise<void>`
- Tables: `cases`, `nodes` (nullable `x`, `y`), `edges`, `evidence`, `activity`, `coverage`, `suggestions`, `watches`, `snapshots`, `changes`, `usage`; each has `owner_email`.

- [ ] **Step 1: Test database helper.** Create `server/db/test-db.ts` that opens an in-memory PGlite (`import { PGlite } from "@electric-sql/pglite"`) and applies this app's migrations. The pattern is `REF/templates/tasks/server/db/test-tasks-table.ts`, but do not copy its tasks DDL or its `createRequire` path into `packages/core`, which will not resolve in a standalone app.
- [ ] **Step 2: Failing tests** in `server/board/store.test.ts`: `pins a node with evidence`, `a second pin of the same key adds evidence and keeps one node`, `listBoard never returns another owner's rows`, `setStatus writes an activity row with the actor`, `moveNode persists x and y`, `setCoverage upserts by source`.
- [ ] **Step 3: Run** `pnpm test server/board/store.test.ts`; expected FAIL (modules missing).
- [ ] **Step 4: Implement** the schema with the helpers from `@agent-native/core/db/schema` as in `REF/templates/tasks/server/db/schema.ts`; migrations in `server/db/migrations.ts` and plugin `server/plugins/db.ts` following the same files in `REF/templates/tasks/`; `export const getDb = createGetDb(schema)` in `server/db/index.ts`. Until Task 2 exists, the store throws when `evidence` is empty.
- [ ] **Step 5: Run** the tests; expected PASS. Run `pnpm typecheck`.
- [ ] **Step 6: Commit** "feat: board data model and store".

### Task 2: Provenance and language rules

**Files:**
- Create: `server/board/provenance.ts`, `server/board/language.ts`
- Modify: `server/board/store.ts` (call the rules)
- Test: `server/board/provenance.test.ts`, `server/board/language.test.ts`

**Interfaces:**
- Produces:
  - `class ProvenanceError extends Error { code: "no_source" | "bad_url" | "agent_not_allowed" | "reason_required" | "bad_transition" }`
  - `assertEvidence(evidence: EvidenceInput[]): void`
  - `canTransition(from: Status, to: Status, actor: Actor): boolean`
  - `assertTransition(from: Status, to: Status, actor: Actor, reason?: string): void`
  - `class LanguageError extends Error { words: string[] }`
  - `lintAgentText(text: string): string[]` (banned words found) and `assertAgentText(text: string): void` (throws `LanguageError`)
  - `BANNED_WORDS: readonly string[]` = suspicious, shady, guilty, criminal, fraud, fraudulent, launderer, laundering, corrupt, illegal, scam

- [ ] **Step 1: Failing tests.** Provenance: `assertEvidence([])` throws `no_source`; an item with an empty `recordId` throws `no_source`; an `http://` URL throws `bad_url`. Transitions, as a table test: agent `proposed->proposed` true; agent `proposed->confirmed` false; person `proposed->confirmed` true; person `confirmed->rejected` true; any `to` of `rejected` or `dead-end` without a reason throws `reason_required`; `dead-end->proposed` allowed only for a person. Language: `lintAgentText("Records show 11 companies at this address")` returns `[]`; `lintAgentText("a suspicious fraud network")` returns `["suspicious","fraud"]`; matching is case-insensitive on whole words.
- [ ] **Step 2: Run** `pnpm test server/board`; expected FAIL.
- [ ] **Step 3: Implement.** `pinNode`, `pinEdge` and `setStatus` call `assertEvidence` and `assertTransition`. The language check is NOT applied to labels or facts copied from a record (a real company may be called "Fraud Prevention Ltd"); it is applied only to text the agent writes itself, in Tasks 8 and 15.
- [ ] **Step 4: Run** tests; expected PASS (including Task 1).
- [ ] **Step 5: Commit** "feat: enforce provenance and wording rules in code".

### Task 3: Source plumbing (limiter, cache, result type, hashing)

**Files:**
- Create: `server/sources/types.ts`, `server/sources/limiter.ts`, `server/sources/cache.ts`, `server/sources/hash.ts`
- Test: `server/sources/limiter.test.ts`, `server/sources/hash.test.ts`

**Interfaces:**
- Produces:
  - `SourceResult<T> { data: T; evidence: EvidenceInput; complete: boolean; note?: string }`
  - `class SourceError extends Error { source: string; kind: "rate_limited" | "not_found" | "timeout" | "bad_response" | "no_key" }`
  - `interface Limiter { take(): Promise<boolean>; resetAt(): number }`
  - `createLimiter(o: { max: number; windowMs: number; now?: () => number }): Limiter` (in-memory; the shared, database-backed one is Task 6)
  - `createCache(ttlMs: number, now?: () => number): { get<T>(k: string): T | undefined; set<T>(k: string, v: T): void }`
  - `contentHash(body: unknown): string` (sha-256 hex of key-sorted JSON)

- [ ] **Step 1: Failing tests:** `limiter allows max then refuses until the window ends` (fake clock), `cache expires after ttl`, `contentHash is stable across key order and differs when a value changes`.
- [ ] **Step 2: Run** `pnpm test server/sources`; expected FAIL. **Step 3: Implement** the four small modules; no network code here. **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: source plumbing".

### Task 4: Companies House client

**Files:**
- Create: `server/sources/companies-house.ts`, `server/sources/fixtures/ch/*.json`
- Test: `server/sources/companies-house.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `createChClient(o: { apiKey?: string; fetch?: typeof fetch; limiter?: Limiter; cache?: Cache }): ChClient` with
  - `searchCompanies(q: string): Promise<SourceResult<CompanyHit[]>>` (`GET /search/companies?q=`)
  - `getCompany(n: string): Promise<SourceResult<CompanyProfile>>` (`GET /company/{n}`; profile includes `type` such as `llp` or `limited-partnership`, registered office address, status)
  - `getOfficers(n: string, o?: { cap?: number }): Promise<SourceResult<Officer[]>>` (`GET /company/{n}/officers`; cap default 50; when truncated `complete: false` and `note: "showing 50 of N"`)
  - `getControllers(n: string): Promise<SourceResult<Controller[]>>` (`GET /company/{n}/persons-with-significant-control`)
  - `getFilings(n: string, o?: { cap?: number }): Promise<SourceResult<Filing[]>>` (`GET /company/{n}/filing-history`)
  - `getAppointments(officerId: string, o?: { cap?: number }): Promise<SourceResult<Appointment[]>>` (`GET /officers/{officerId}/appointments`)
  - `searchByLocation(q: string, o?: { cap?: number }): Promise<SourceResult<CompanyHit[]>>` (`GET /advanced-search/companies?location=`)
- Base URL `https://api.company-information.service.gov.uk`. Auth: HTTP Basic with the key as username and an empty password. No key -> `SourceError{kind:"no_key"}`; HTTP 429 -> `rate_limited` with no retry; 404 -> `not_found`; a refused `limiter.take()` -> `rate_limited` before any call.
- Evidence per call: url = the public page (`https://find-and-update.company-information.service.gov.uk/company/{n}` and `/officers`), recordId = company number or officer id, hash = `contentHash(response body)`.

- [ ] **Step 1: Fixtures.** With the owner's key, record responses for LCM Alliance LLP `OC372263` and Metastar Invest LLP `OC346224`. Without a key yet, hand-write minimal fixtures in the register's JSON shape marked `"_synthetic": true` and re-record when the key arrives.
- [ ] **Step 2: Failing tests** with an injected fake `fetch`: `sends basic auth with the key and empty password`; `maps 429 to rate_limited and does not retry`; `caps officers at 50 and says "showing 50 of N"`; `returns evidence with url, recordId and a stable hash`; `no key throws no_key`; `a refused limiter throws rate_limited without calling fetch`.
- [ ] **Step 3: Implement** with a 10-minute cache keyed by URL. **Step 4: Run**; expected PASS. Optional live smoke (skipped unless `COMPANIES_HOUSE_API_KEY` is set): fetch `OC372263` and assert the name contains `LCM`.
- [ ] **Step 5: Commit** "feat: Companies House client".

### Task 5: ICIJ, GLEIF and SEC clients

**Files:**
- Create: `server/sources/icij.ts`, `server/sources/gleif.ts`, `server/sources/sec.ts`
- Test: `server/sources/icij.test.ts`, `server/sources/gleif.test.ts`, `server/sources/sec.test.ts`

**Interfaces:**
- Produces:
  - `createIcijClient(o?: { fetch?: typeof fetch }): IcijClient` with `reconcile(name: string): Promise<SourceResult<IcijCandidate[]>>`; `IcijCandidate = { id: string; name: string; score: number; matched: boolean; description: string }`. Call `POST https://offshoreleaks.icij.org/api/v1/reconcile` with body `{"queries":{"q0":{"query": name}}}` and read `q0.result[]` (`id`, `name`, `score`, `match`, `description`); tested live 2026-10-30. An empty result is a normal outcome: `data: []`, `complete: true`, `note: "no match in Offshore Leaks"`. A candidate is never treated as confirmed.
  - `createGleifClient(o?: { fetch? }): GleifClient` with `findByName(name: string): Promise<SourceResult<LeiRecord[]>>`
  - `createSecClient(o: { userAgent?: string; fetch? }): SecClient` with `findCompany(name: string): Promise<SourceResult<SecFiler[]>>` and `recentFilings(cik: string): Promise<SourceResult<SecFiling[]>>`. Every request sends the declared `User-Agent`; limit 10 requests a second; a missing `userAgent` throws `SourceError{kind:"no_key"}`.

- [ ] **Step 1: Verify endpoints with one live call each** before writing tests: the ICIJ node page URL (expected `https://offshoreleaks.icij.org/nodes/{id}`; use what the live page shows), the GLEIF lookup by name (try `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=<name>`, falling back to `fuzzycompletions` then fetching the record), and SEC (`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&output=atom` worked on 2026-10-30; `https://data.sec.gov/submissions/CIK##########.json` for filings). Record the confirmed URLs in each file's header comment.
- [ ] **Step 2: Failing tests** with fixtures: `icij returns candidates with score and matched=false for fuzzy hits`; `icij empty result is a normal null`; `sec sends the declared user agent`; `sec without a user agent throws no_key`; `gleif empty result is a normal null`.
- [ ] **Step 3: Implement**; each client returns `SourceResult` with evidence (source, record page URL, id, hash). **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: ICIJ, GLEIF and SEC clients".

### Task 6: Usage caps and the shared source registry

**Files:**
- Create: `server/usage/caps.ts`, `server/sources/registry.ts`, `server/usage/db-limiter.ts`
- Test: `server/usage/caps.test.ts`, `server/sources/registry.test.ts`

**Interfaces:**
- Produces:
  - `type CapKind = "ch-call" | "case-create" | "agent-run"`
  - `class CapError extends Error { kind: CapKind | "kill-switch" }` (message plain: `"Daily limit reached. Try again tomorrow."`)
  - `assertWithinCaps(ownerEmail: string, kind: CapKind, now?: Date): Promise<void>` (reads the env names in Global Constraints; `REDSTRING_KILL_SWITCH=1` refuses everything with `kind: "kill-switch"`)
  - `recordUsage(ownerEmail: string, kind: CapKind, n?: number, now?: Date): Promise<void>` (rows in the `usage` table keyed by owner, day and kind)
  - `createDbLimiter(o: { key: string; max: number; windowMs: number; now?: () => number }): Limiter` (counts in the `usage` table by window, so it holds across serverless instances; the Task 3 in-memory limiter does not)
  - `type Sources = { ch: ChClient; icij: IcijClient; gleif: GleifClient; sec: SecClient }`
  - `buildSources(ownerEmail: string): Promise<Sources>` (the only place clients are built; the Companies House limiter checks the per-user daily cap, records usage, and applies the shared 500-per-5-minutes budget)
- LLM spend: the framework's Settings "limits" are loop `maxIterations`, not a daily cap, so it cannot protect the owner's key. Read `createAgentChatPlugin`'s options in `REF/packages/core/src/server/agent-chat-plugin.ts` for a per-run hook; if one exists count runs under `agent-run` against `REDSTRING_AGENT_RUNS_PER_USER_DAY` (default 20). If none exists, the protections are a low `maxIterations`, a small default model, and a monthly spend limit set by the owner in the Anthropic console on the demo key (owner action; see HANDOFF.md).

- [ ] **Step 1: Failing tests:** `the 11th case in a day is refused for that user only`; `the global Companies House budget refuses every user once spent`; `the kill switch refuses everything`; `a new day resets per-user counts`; `the db limiter allows max then refuses within one window across two limiter instances`; `buildSources records one ch-call per request`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: usage caps and source registry".

### Task 7: Expansion service and observations

**Files:**
- Create: `server/board/expand.ts`, `server/board/observations.ts`
- Test: `server/board/expand.test.ts`, `server/board/observations.test.ts`

**Interfaces:**
- Consumes: `Sources`, store functions.
- Produces:
  - `searchEntity(s: Sources, a: { query: string; jurisdiction: "uk" | "us" }): Promise<{ hits: EntityHit[]; note?: string }>` (never pins; UK uses `ch.searchCompanies`, US uses `sec.findCompany` plus `gleif.findByName`; zero hits returns `note: "no matches"`)
  - `expandCompany(s: Sources, a: { caseId: string; ownerEmail: string; nodeId: string; actor: Actor; include?: Array<"officers" | "controllers" | "address" | "filings" | "leaks" | "neighbours"> }): Promise<ExpandResult>`
  - `expandOfficer(s: Sources, a: { caseId: string; ownerEmail: string; nodeId: string; actor: Actor }): Promise<ExpandResult>` (uses `getAppointments`)
  - `type ExpandResult = { pinnedNodes: number; pinnedEdges: number; incomplete: string[]; skippedDeadEnds: number }`
  - `computeObservations(board: Pick<Board, "nodes" | "edges">): Observation[]` (pure; counts and ids only, no prose)
- Rules:
  - Node keys: company number (UK) or CIK (US), officer id, normalised address string, filing transaction id. Agent pins use `status: "proposed"`. Keys already `rejected` or `dead-end` in the case are skipped and counted in `skippedDeadEnds`.
  - A `SourceError` of kind `rate_limited` or `timeout` stops that part, adds the source to `incomplete`, sets that source's coverage to `incomplete` with the reason, keeps earlier pins, and logs an activity row.
  - `neighbours` calls `searchByLocation` on the registered address (cap 50) and pins companies at that address as `same-address` edges.
  - A UK company of type `limited-partnership` whose officers list is empty gets coverage `not_read`: `"Partners are not in the register data; they may be in scanned filings, which are not read."`
  - A US company: pin the filer, recent filings as `document` nodes, GLEIF parent links as edges, and coverage `not_available`: `"The US has no public officer or owner register."`
  - Edge types: officer -> company `officer-of` (`member-of` for LLP members), controller -> company `controls`, company -> address `registered-at`, ICIJ hit -> subject `candidate-match` (status `proposed`, score in the evidence excerpt).

- [ ] **Step 1: Failing tests** (fake clients): `searchEntity with zero hits returns note and pins nothing`; `two officers named identically become two nodes keyed by officer id`; `expandCompany pins officers as proposed with evidence`; `a rejected officer is skipped and counted`; `rate_limited mid-expansion keeps the first pins, lists the source under incomplete and sets coverage incomplete`; `a company with 200 officers pins 50 and reports "showing 50 of 200"`; `a limited partnership with no officers gets coverage not_read`; `a US filer gets coverage not_available and no person nodes`; `computeObservations reports 3 companies at one address with ids and no prose`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: expansion service and pattern observations".

### Task 8: Agent-visible actions

**Files:**
- Create: `actions/search-entity.ts`, `actions/expand-node.ts`, `actions/check-leaks.ts`, `actions/suggest-reject.ts`, `actions/get-board.ts`, `actions/navigate-to-node.ts`
- Modify: `actions/view-screen.ts` (also return `selection` and the open case id)
- Test: `actions/agent-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 6, 7. Every action uses `defineAction` from `@agent-native/core/action`, zod schemas, `ctx?.userEmail` for scoping, and writes an activity row with `caller: ctx.caller`.
- Produces:
  - `search-entity` `{ query: string; jurisdiction: "uk" | "us" }` -> hits; `http: { method: "GET" }`, `mcpTool: true`
  - `expand-node` `{ caseId: string; nodeId: string; include?: [...] }` -> `ExpandResult`; `http: { method: "POST" }`
  - `check-leaks` `{ caseId: string; nodeId: string }`; POST
  - `suggest-reject` `{ caseId: string; targetId: string; reason: string }` -> stores a suggestion (status unchanged); runs `assertAgentText(reason)`
  - `get-board` `{ caseId: string }` -> `Board & { observations: Observation[] }`; `http: { method: "GET" }` (needed because `useActionQuery` always sends GET), `readOnly: true`, `mcpTool: true`
  - `navigate-to-node` `{ caseId: string; nodeId: string }`; `http: false`; writes a `navigate` command with `writeAppStateForCurrentTab` as in `REF/templates/chat/actions/navigate.ts`
- The agent cannot create cases (Task 9) and cannot pin free-form items; it only expands existing nodes.

- [ ] **Step 1: Failing tests** (call each `run` with a fake `ctx`): `expand-node by the agent creates only proposed items`; `an expansion that would pin without evidence returns a ProvenanceError and writes an activity row`; `suggest-reject with the word "suspicious" is refused`; `suggest-reject leaves status unchanged`; `get-board refuses a case owned by someone else`; `get-board includes observations`.
- [ ] **Step 2: Run** `pnpm test actions/agent-actions.test.ts`; expected FAIL. **Step 3: Implement** as thin wrappers over Tasks 1-7. **Step 4: Run**; expected PASS; `pnpm typecheck`.
- [ ] **Step 5: Commit** "feat: agent-visible actions".

### Task 9: Person-only actions

**Files:**
- Create: `actions/create-case.ts`, `actions/pin-item.ts`, `actions/set-status.ts`, `actions/annotate.ts`, `actions/move-node.ts`, `actions/review-change.ts`, `actions/watch-entity.ts`
- Test: `actions/person-actions.test.ts`

**Interfaces:**
- Produces: each action sets `uiOnly: true` and in `run` throws `ProvenanceError("agent_not_allowed")` unless `ctx?.caller === "frontend"`. Beyond the spec's confirm/reject/dead-end, creating cases, free-form pins, annotations, moves, reviews and watches are also person-only (my call: they spend quota or record the person's own judgement).
  - `create-case` `{ title: string; seeds: Array<{ companyNumber: string }> }` -> `{ caseId: string }`; checks the case cap; pins each seed as actor `person`, status `confirmed`
  - `pin-item` `{ caseId: string; type: NodeType; label: string; sourceUrl: string; reference: string; source: "occrp" | "manual" }` -> pins with `manual` or `occrp` evidence (https URL required)
  - `set-status` `{ caseId: string; targetKind: "node" | "edge"; targetId: string; to: Status; reason?: string }`
  - `annotate` `{ caseId: string; targetId: string; text: string }`
  - `move-node` `{ caseId: string; nodeId: string; x: number; y: number }`
  - `review-change` `{ caseId: string; changeId: string; decision: "accept" | "dismiss" }`
  - `watch-entity` `{ caseId: string; nodeId: string }`

- [ ] **Step 1: Failing tests:** `set-status refuses callers "tool", "mcp" and "a2a"`; `allows caller "frontend" and records actor person`; `rejected without a reason throws reason_required`; `create-case seeds are confirmed with person as actor`; `create-case refuses over the daily case cap`; `pin-item rejects an http URL`; `none of these actions appears in the list of actions exposed to the agent` (assert on the registry filtered the way the plugin filters it).
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: person-only actions".

### Task 10: Watch snapshots (start the real baseline early)

**Files:**
- Create: `server/watch/snapshot.ts`, `actions/snapshot-watches.ts`
- Test: `server/watch/snapshot.test.ts`

**Interfaces:**
- Produces:
  - `takeSnapshot(s: Sources, companyNumber: string): Promise<Snapshot>` with `Snapshot { officersHash: string; controllersHash: string; filingsHash: string; filingCount: number; takenAt: string }`
  - `diffSnapshots(a: Snapshot, b: Snapshot): Array<Pick<Change, "kind" | "summary">>` (summaries are counts only, for example `"2 new filings"`)
  - action `snapshot-watches` `{}` (agent-visible so a scheduled job can call it; POST): for every watch owned by the caller, take a snapshot, store it, and write `Change` rows through `addChange` when a diff exists. This replaces any `pnpm script` idea: `pnpm script` is a deprecated alias of `pnpm action`, and a job body is an agent prompt that can only call actions.

- [ ] **Step 1: Failing tests:** `identical inputs give no changes`; `one new filing gives "1 new filing"`; `an officer resigning changes officersHash and reports an officers change`; `snapshot-watches only touches the caller's watches`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Start the real baseline.** Choose one real, active UK company that files often, create a case, add a watch, run `pnpm action snapshot-watches`, and note the date in `docs/demo-notes.md`. Run it again each day; the demo diff is real, or the board says "no changes since <date>".
- [ ] **Step 6: Commit** "feat: watch snapshots".

### Task 11: UI shell, design direction, first screen, new-case flow

**Files:**
- Create: `app/routes/cases._index.tsx`, `app/routes/case.$caseId.tsx`, `app/components/board/BoardCanvas.tsx`, `NodeCard.tsx`, `StringEdge.tsx`, `NewCase.tsx`, `app/hooks/use-board.ts`, `DESIGN.md` (replace the template's), `app/fixtures/laundromat-board.ts`
- Modify: `app/hooks/use-navigation-state.ts` (map `view: "case"` plus `nodeId` to `/case/:id?node=:nodeId`). Routes are file-based (`flatRoutes`), so nothing is registered in `app/routes.ts`.
- Test: `app/components/board/NodeCard.spec.tsx`, `app/components/board/NewCase.spec.tsx`

**Interfaces:**
- Consumes: `get-board` through `useActionQuery`; `search-entity` and `create-case`.
- Produces: `useBoard(caseId: string): { board: (Board & { observations: Observation[] }) | undefined; refetch(): void }`; `<BoardCanvas board selectedIds onSelect onMove />`; node and string visuals showing status, who added it (person or agent) and evidence count; `<NewCase />` with a name search, a pick list of hits (never auto-picking; zero hits shows "no matches"), and a Create button.

- [ ] **Step 1: Look.** Write `DESIGN.md` for Redstring (case-file and red-string idea; palette, type, motion; a look of its own, not a reuse of an earlier project). Build the case page against `app/fixtures/laundromat-board.ts` (about 25 nodes from the records already checked). Screenshot desktop and phone widths with Playwright and show the owner before building any other screen. Stop here until the owner replies.
- [ ] **Step 2: Failing tests:** `NodeCard shows status, actor and evidence count, and labels a proposed agent item "proposed by agent"`; `NewCase shows a pick list for several hits and does not create until one is chosen`; `NewCase shows "no matches" for zero hits`.
- [ ] **Step 3: Implement** the shell; selection is written to application state `selection` (ids only, the way `use-navigation-state.ts` writes `navigation`).
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`; expected PASS.
- [ ] **Step 5: Commit** "feat: case page shell with fixture board and new-case flow".

### Task 12: Panels and person controls

**Files:**
- Create: `app/components/board/EvidencePanel.tsx`, `CoveragePanel.tsx`, `ActivityLog.tsx`, `StatusControls.tsx`, `GoDeeper.tsx`, `ObservationsStrip.tsx`, `KnownListCheck.tsx`, `server/board/known-list.ts`
- Test: `app/components/board/panels.spec.tsx`, `server/board/known-list.test.ts`

**Interfaces:**
- Produces: `StatusControls` calls `set-status` through `useActionMutation` and asks for a reason on reject or dead-end; dragging a node calls `move-node`; `EvidencePanel` lists each evidence row (source, link, record id, retrieved date, hash prefix) and is the only place month and year of birth appears; `CoveragePanel` renders each `CoverageRow`; `ObservationsStrip` renders counts like "3 companies at this address" with links to the nodes; `GoDeeper` calls `sendToAgentChat()` with the selected node ids and the person's text; `ActivityLog` shows actor, action and time; `checkKnownList(names: string[], board: Pick<Board, "nodes">): { found: string[]; missing: string[] }` (normalised name or company number match, pure) with `KnownListCheck` letting the person paste OCCRP's published list.

- [ ] **Step 1: Failing tests:** `reject asks for a reason and blocks submit without one`; `the evidence panel shows month and year of birth, the node card does not`; `the coverage panel shows an empty ICIJ result as "no match", not as an error`; `the activity log marks agent rows differently from person rows`; `checkKnownList finds a name regardless of case and company suffix punctuation and reports the rest as missing`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Screenshot and show the owner; commit** "feat: evidence, coverage, activity, observations and status controls".

### Task 13: Agent instructions and live board

**Files:**
- Create/Modify: `AGENTS.md`, `server/plugins/agent-chat.ts`
- Test: `actions/agent-contract.test.ts`

**Interfaces:**
- `server/plugins/agent-chat.ts` follows `REF/templates/tasks/server/plugins/agent-chat.ts`: `createAgentChatPlugin({ appId: "redstring", mcp: { appApprovalPage: true }, actions: loadActionsFromStaticRegistry(actionsRegistry), initialToolNames: ["view-screen","get-board","search-entity","expand-node","check-leaks","suggest-reject","navigate-to-node","snapshot-watches"], systemPrompt })`.
- The system prompt states, in plain rules: call `view-screen` before acting so "this" means the selected item; pin only what a record shows and name the record; describe records, never people ("Companies House lists X as a member since 2011"); never merge people with the same name; when unsure suggest, do not decide; say what you could not read; skip dead ends and say how many.

- [ ] **Step 1: Failing test:** `the tool list the agent receives excludes create-case, pin-item, set-status, annotate, move-node, review-change and watch-entity`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Manual check, recorded in `docs/spike-results.md`:** select a node, ask "dig into this one", watch the board fill live and the screen move to the first lead; ask the agent to confirm a lead and see it decline and suggest instead.
- [ ] **Step 6: Commit** "feat: agent instructions and tool surface".

### Task 14: Review queue and scheduled re-check

**Files:**
- Create: `app/components/board/ReviewQueue.tsx`, `actions/list-changes.ts`
- Test: `actions/list-changes.test.ts`

**Interfaces:**
- Produces: `list-changes` `{ caseId: string }` -> `Change[]` pending review; `http: { method: "GET" }`, `readOnly: true`, `mcpTool: true`. `ReviewQueue` shows agent proposals (new pins, open suggestions) and watch changes, with accept or dismiss calling `set-status` or `review-change`.
- The scheduled re-check is a seeded database resource (a job named `recheck-watches`, created through the `manage-jobs` or `manage-automations` tool or the Automations screen, running as its creator) whose prompt body says: call `snapshot-watches`, then call `list-changes` for the open case and summarise what is new. It is not a repo file. Locally it needs `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`; on Vercel it needs `CRON_SECRET` in production. The fallback from Task 0 applies: a "Re-check now" button calling `snapshot-watches` from the UI.

- [ ] **Step 1: Failing tests:** `list-changes returns a new-filing change after a second snapshot differs`; `with no differences it returns an empty list and the component shows "no changes since <date>"`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement**; create the job resource and record how in `docs/demo-notes.md`. **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: review queue and re-check".

### Task 15: Sourced brief export

**Files:**
- Create: `server/board/brief.ts`, `actions/export-brief.ts`, `app/components/board/ExportButton.tsx`
- Test: `server/board/brief.test.ts`

**Interfaces:**
- Produces: `buildBrief(board: Board, o: { title: string; generatedAt: string }): { markdown: string; citations: number; unconfirmed: number }`; action `export-brief` `{ caseId: string }` with `needsApproval: true` (an agent call pauses; the person's button runs directly) returning the markdown.
- Format: confirmed items first, each line ending in `[E<n>]` pointing into a numbered evidence list (source, URL, record id, retrieved date); a separate "Unconfirmed" section; a "Ruled out" section listing rejected and dead-end items with their reasons; the exact footer from Global Constraints. Brief text the agent contributes passes `assertAgentText`.

- [ ] **Step 1: Failing tests:** `every line in the findings section ends with a citation marker that exists in the evidence list`; `unconfirmed items appear only under "Unconfirmed"`; `month and year of birth never appears`; `the footer is the exact string`; `rejected and dead-end items are listed under "Ruled out" with their reasons`.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run**; expected PASS.
- [ ] **Step 5: Commit** "feat: sourced brief export".

### Task 16: MCP check (stretch)

**Files:**
- Create: `docs/mcp-demo.md`

- [ ] **Step 1:** With Task 0's MCP proof passing, connect a client (Claude Code or Claude Desktop, builder's choice; a local server is fine) to `/mcp`; confirm `tools/list` shows `get-board`, `list-changes` and `search-entity` (they carry `mcpTool: true`) and not the person-only actions. Loopback needs no auth.
- [ ] **Step 2:** Ask the client "what changed this week in <watched company>?"; expected: it calls `list-changes` and answers from real rows or says there are none. Record the exact prompt and steps in `docs/mcp-demo.md`.
- [ ] **Step 3: Commit** "docs: MCP demo steps". If any step fails, stop and cut; the finale becomes the in-app "what changed" view.

### Task 17: Deploy

**Files:**
- Modify: deployment config per `REF/packages/core/docs/content/vercel.mdx` or `netlify.mdx` (the owner's host)
- Create: `docs/deploy-notes.md`

- [ ] **Step 1:** Create the hosted Postgres (owner's account) and set env vars from Global Constraints on the host: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `COMPANIES_HOUSE_API_KEY`, `REDSTRING_SEC_USER_AGENT`, the caps, `AUTH_REQUIRE_EMAIL_VERIFICATION=0`, and on Vercel `CRON_SECRET`. `AUTH_SKIP_EMAIL_VERIFICATION` is ignored on a hosted production deploy, so do not rely on it. Never set `AUTH_DISABLED`. Confirm with the owner that the demo key has a monthly spend limit set in the Anthropic console.
- [ ] **Step 2:** Run the migration (`pnpm migrate:production`; the script exists in the template), build and deploy per the host guide.
- [ ] **Step 3: Acceptance, in a private window:** sign up with email and password in under 60 seconds with no email step; create a case for a company you did not prepare; the board fills with sourced items; the 11th case of the day is refused politely; setting `REDSTRING_KILL_SWITCH=1` stops new work. If sign-up friction fails, switch to the one published demo account described in the spec.
- [ ] **Step 4:** Record the live URL and test results in `docs/deploy-notes.md`. Commit "chore: deploy notes".

### Task 18: Demo, recording and submission

**Files:**
- Create: `docs/demo-script.md`, `docs/submission.md`

- [ ] **Step 1: Seed the demo case.** OCCRP's own pages blocked automated reads (HTTP 403), so take the four shell names and numbers by hand from the published page. Create the case with `create-case` using the company numbers, and add the OCCRP page itself as evidence with `pin-item` (`source: "occrp"`) so the board says where the four names came from. Run expansions; keep exactly what the register returns, including the not-read partners and the ICIJ null.
- [ ] **Step 2: Script the recording** (about three minutes) from the spec's "Demo plan": seed and honest limits, live fill, a real rejected candidate that becomes a dead end, the OCCRP list check (`KnownListCheck`), a company chosen by the viewer, the activity log, the real watch diff or "no changes since <date>", and the Claude question only if Task 16 passed. Record with the Clips app; open the link in a private window to confirm it plays without a login.
- [ ] **Step 3: Write `docs/submission.md`:** the form fields (first name, email, project name, project description, public Clips URL, rules checkbox; optional repository URL and slides), a description that names the team and discloses pre-existing work (the Agent-Native framework and its `chat` template, MIT; the public data sources by name; no reused prior code unless added here), and states plainly what is simulated: nothing.
- [ ] **Step 4: Submit** by Mon 2026-11-09 12:00 PT and confirm receipt; "recording a clip alone does not submit an entry".
- [ ] **Step 5: Publish the repository** only with the owner's yes; remove `.env`; confirm no keys in git history.
