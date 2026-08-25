# Budget Tracking

Budget Tracking is a browser-based React application for household cash flow
and informal lending. The product is displayed as **Sổ Tài Chính** and supports
Vietnamese and English interfaces, light and dark themes, responsive layouts,
and per-account finance records.

## Current capabilities

- Track transactions, categories, borrowers, lending rates, and loans.
- View dashboard totals, expense groups, outstanding loans, and recent activity.
- Calculate simple and compound interest.
- Add, edit, delete, record payments, and bulk-edit supported records.
- Persist application state in IndexedDB with a localStorage compatibility copy.

## Run locally

Requirements: a current Node.js LTS release and npm.

```sh
npm install
npm start
```

The development server opens the application at `http://localhost:3000` by
default.

Useful checks:

```sh
npm test
npm run build
```

## Repository structure

```text
.
├── database/
│   └── schema.sql                    # PostgreSQL schema used by the optional API
├── docs/
│   ├── INDEX.md                      # Detailed documentation entry point
│   └── context-pack/                 # Current architecture and project notes
├── public/                           # Create React App HTML shell
├── server/                           # Flask authentication and state API
├── src/
│   ├── app/App.tsx                   # Application composition root
│   ├── features/finance/             # Finance domain, state, UI, and styles
│   ├── index.tsx                     # Browser entry point
│   └── lib/                          # Browser persistence helpers
├── AGENTS.md                         # Instructions for coding agents
└── package.json                      # Dependencies and lifecycle commands
```

`src/features/finance/components/FinanceApp.tsx` currently owns most screens,
state coordination, calculations, localization, and record workflows. New
finance-domain code belongs under `src/features/finance/`; keep the composition
root at `src/app/App.tsx`.

For a deeper map of the runtime and maintained documents, start at
[`docs/INDEX.md`](docs/INDEX.md).

## PostgreSQL API

The application includes an optional Flask API under `server/`. Without
`REACT_APP_API_URL`, it keeps the existing IndexedDB/localStorage mode. When the
API URL is configured, registration, login, session restoration, and each
user's finance snapshot are persisted through PostgreSQL; browser storage is
retained as a local cache during migration.

Create the schema and start both processes:

```sh
createdb personal_finance
psql personal_finance < database/schema.sql
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
cp server/.env.example server/.env
cp .env.example .env
set -a; source server/.env; set +a
.venv/bin/flask --app server.app run --port 5000
npm start
```

Set a stable, random `SECRET_KEY` outside source control before creating real
sessions. `DATABASE_URL` is read only by Flask and must never be added to React
environment variables. The API uses HttpOnly session cookies, CSRF validation,
password hashing, per-user ownership, and a JSONB snapshot for safe migration
from the browser data model.

### Google sign-in

Create an **OAuth 2.0 Web application** client in Google Cloud Console. Add
`http://localhost:3000` under **Authorized JavaScript origins** for local
development. Google does not accept raw LAN IP addresses such as
`http://192.168.x.x:3000`: using Google sign-in from another device requires a
public domain you control served over HTTPS. Set the same client ID in both
files:

```sh
# .env.local
REACT_APP_GOOGLE_CLIENT_ID=...apps.googleusercontent.com

# server/.env
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

Re-run `psql personal_finance < database/schema.sql` once for an existing
database, install the updated server requirements, and restart both processes.
The browser sends a Google ID token to Flask; Flask verifies its issuer,
audience, expiry, and verified email before it creates a session. Do not add a
Google OAuth client secret to this project.

For a local Homebrew PostgreSQL 16 installation, the existing development
database can be inspected with:

```sh
/opt/homebrew/opt/postgresql@16/bin/psql personal_finance
brew services list
brew services start postgresql@16
brew services stop postgresql@16
```

These commands are machine-specific; adapt them for other PostgreSQL
installations.
