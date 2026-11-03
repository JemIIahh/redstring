# MCP demo: an outside agent asks "what changed?"

**Status: ready to try, not yet run live.** The live run needs two things that are the owner's to do: signing a client in over OAuth (below), and a case with a watched company that has been checked at least twice (needs a Companies House key). If it does not work in one try, skip it: the finale is the in-app **Review** panel, which shows the same answer ("No changes since <date>" or the changes themselves).

## What an outside agent is offered

Exactly four read tools, and nothing that writes:

| Tool | What it returns |
| --- | --- |
| `list-cases` | the owner's cases, with counts |
| `get-board` | one case: items and links with status, reasons and where each came from (a lean view: no addresses, hashes or excerpts) |
| `list-changes` | changes waiting on watched companies, which company, how many are watched, and when any was last read |
| `search-entity` | a register search (spends the owner's Companies House allowance, which is capped) |

Not offered: every person-only action (create, pin, confirm, reject, note, move, answer, watch), `export-brief` (it needs the person's approval), and the framework's built-in `ask_app`. `ask_app` runs this app's own agent outside the spend guard, so it is turned off with `MCP_OPTIONS.builtinCrossAppTools: false` in `server/agent/config.ts`.

## What has been checked

`server/agent/mcp-surface.test.ts` runs the framework's own MCP request handler over our real actions and our real options, as a signed-in person, and asserts: `tools/list` is exactly the four tools above; none of the person-only names, `export-brief`, `ask_app`, `ask_app_status` or `ask-agent` is in it; and calling a person-only action, `export-brief`, `ask_app` or a made-up name by name is refused. Turning `ask_app` back on makes it fail.

**Not checked:** a real client over the network. That needs OAuth. On this version loopback is not open (`POST /mcp` answers Unauthorized), which the plan assumed it would be; see `docs/spike-results.md`.

## Steps for the owner

1. Start the app: `pnpm dev` (it serves on http://localhost:8080).
2. Connect a client. This opens a browser to sign in and approve, and it adds an entry to that client's own settings (Claude Code or Claude Desktop), which is outside this repository, so it is yours to run: `npx @agent-native/core@latest connect http://localhost:8080`
3. In the client, check the tool list is the four above and nothing else.
4. Ask it, exactly: **"What changed this week in <the watched company>? Use my Redstring cases."** It should call `list-cases`, then `list-changes` for that case, and answer from what comes back.

**Good answer:** names the company and the change (for example "1 new filing"), or says there are none **and gives the date it was last checked**. If `list-changes` returns no date, the right answer is "that company has not been checked yet", never "no changes".

## If it goes wrong

- Unauthorized or no tools: the sign-in did not finish; run the connect command again.
- Tools missing: confirm step 3; the list is pinned by the test above.
- Anything else: stop. Do not widen the tool list to make it work; a new tool for outside agents is a decision, made in `server/agent/mcp-surface.test.ts`.
