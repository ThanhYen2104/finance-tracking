# Repository instructions for Codex

## Required context

Before any large, cross-cutting, architectural, persistence, authentication, localization, or documentation task, read [`docs/INDEX.md`](docs/INDEX.md) first and follow the links relevant to the task.

For small, isolated changes, consult the index whenever the affected area or its constraints are unclear.

## Working rules

- Treat source code and executable configuration as the source of truth when documentation disagrees.
- Keep [`docs/context-pack/DOCUMENT_STATUS.md`](docs/context-pack/DOCUMENT_STATUS.md) current when adding, replacing, or materially changing repository documentation.
- Do not describe the PostgreSQL schema as connected to the browser application until an API integration exists in source code.
- Preserve the `FinanceApp` domain name and the composition root at `src/app/App.tsx`.
- Validate changes with the narrowest relevant checks, then use the repository test/build scripts when the change can affect the application lifecycle.
- Never place credentials, connection strings, or real user financial data in frontend code or documentation.

