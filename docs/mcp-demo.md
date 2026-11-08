# MCP demo: an outside agent asks "what changed?"

**Status: hosted protocol checks passed on 2026-11-07; the conversational watch demo remains unrecorded.** A real signed-in browser minted an MCP connection through the Connect page. Calls to the deployed `/mcp` returned exactly the four read tools below and refused `ask_app`. No model was invoked. A watched-company question in a separately connected agent client still needs a real watch history and client authorization. If it does not work in one try, skip it: the finale is the in-app **Review** panel, which shows the same answer ("No changes since <date>" or the changes themselves).

## What an outside agent is offered

Exactly four read tools, and nothing that writes:

| Tool | What it returns |
| --- | --- |
| `list-cases` | the owner's cases, with counts |
| `get-board` | one case: items and links with status, reasons and where each came from (a lean view: no addresses, hashes or excerpts) |
| `list-changes` | changes waiting on watched companies, which company, how many are watched, and when any was last read |
| `search-entity` | a register search (spends the owner's Companies House allowance, which is capped) |

Not offered, to any token: every person-only action (create, pin, confirm, reject, note, move, answer, watch), `export-brief` (it needs the person's approval), the other agent actions (`expand-node`, `check-leaks`, `snapshot-watches` and so on), and every way into this app's own agent (`ask_app`, `ask_app_status`, `ask-agent`). Those run the agent outside the spend guard, and on a public demo anyone can sign up and mint a token for their own account, including a `--full-catalog` one (or the host can set `AGENT_NATIVE_MCP_FULL_CATALOG=1`), so they are denied for every token: `MCP_OPTIONS.builtinCrossAppTools: false` turns off the built-in, and `mcpDenyActions` in `server/agent/config.ts` denies everything that is not one of the four reads (the plugin builds it from the whole registry, so a new action starts closed).

## What has been checked

`server/agent/mcp-surface.test.ts` runs the framework's own MCP request handler over our real actions and our real options, as a signed-in person, and asserts, for the default catalog and for the full catalog: `tools/list` is exactly the four tools above; and calling a person-only action, `export-brief`, `ask_app`, `ask_app_status`, `ask-agent` or a made-up name by name is refused and never runs our agent (the test hands the framework a stand-in `askAgent`, as the plugin does, and checks it was not called). A last test fails if the plugin stops passing those options and the deny list.

**Hosted regression found and fixed:** the framework injected `tool-search` after the app's deny list was built, so the first production check exposed a fifth tool that the old unit fixture omitted. The deny list now explicitly includes `tool-search`, and the fixture includes the injected action. Both unit catalog modes pass, and the production retest returned exactly four reads. Standard remote OAuth/PKCE and a natural-language question in a separately installed agent client remain untested.

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
