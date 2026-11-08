# Redstring

A shared investigation board for public company records. Name a company, ask an AI agent to research it, and review the sourced cards and connections it proposes.

**[Open Redstring](https://redstring-frontend.vercel.app/cases)** · **[Explore the invented sample board](https://redstring-frontend.vercel.app/case/sample)**

## How it works

- Read public records from Companies House, ICIJ Offshore Leaks, GLEIF and SEC EDGAR.
- Keep sources attached to every card and connection, including record identifiers and retrieval dates.
- Review the agent's proposals. Only a person can confirm a finding, reject a candidate or mark a dead end.
- See search coverage and incomplete results explicitly. A name match is a candidate, not proof of identity.
- Export a cited Markdown brief with confirmed findings, unconfirmed leads and recorded review decisions kept apart. An agent-requested export requires human approval.

The sample board contains invented data and is labelled accordingly. Live cases use public records. Redstring describes records; it does not make findings of wrongdoing.

## Agent-Native

Redstring was built from the Agent-Native chat template for the Builder.io Agent-Native Hackathon. The UI and agent share application actions and saved case data. Person-only actions are enforced by the framework. DeepSeek powers the application's agent through its OpenAI-compatible API.

The frontend is served by Vercel. Netlify runs the backend, authentication, agent and hosted PostgreSQL. Application secrets remain on the backend. Hosted model access is currently paused after the budgeted demo recording; the sample board can be explored without a model call.

## Run locally

Requires Node.js 22.22 or later and pnpm 10.29.1.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open `/case/sample` to explore without registry or model credentials. For live research, configure the server environment using `.env.example`:

- `COMPANIES_HOUSE_API_KEY` for Companies House.
- `REDSTRING_SEC_USER_AGENT` for SEC requests, with your chosen contact details.
- `OPENAI_API_KEY` containing your DeepSeek key, together with `OPENAI_BASE_URL=https://api.deepseek.com/v1`, `AGENT_ENGINE=ai-sdk:openai` and `AGENT_MODEL=deepseek-flash`.
- `DATABASE_URL` and a stable `BETTER_AUTH_SECRET` for hosted production operation.

Keep credentials out of source control. Daily usage caps, a kill switch and an optional recording allowance guard are documented in [AGENTS.md](AGENTS.md) and [deployment notes](docs/deploy-notes.md). Scheduled model automations remain disabled.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm agent-native:doctor
pnpm test:offline-ui
```

Offline UI checks exercise approval, brief download and persistence without spending a model balance. Live model testing requires an agreed budget.

## Project guide

- [Agent and contributor guide](AGENTS.md)
- [Visual design](DESIGN.md)
- [Deployment and acceptance evidence](docs/deploy-notes.md)
- [Demo script and recording notes](docs/demo-script.md)
- [Submission draft and third-party disclosures](docs/submission.md)

The investigation board, source integrations, review controls and brief workflow were built during the event. The project uses the existing Agent-Native framework and chat template, React Flow, open-source UI components, fonts and icons. Claude Code and Codex assisted development under the builder's direction.
