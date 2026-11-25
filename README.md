# Job Hunter — Web

React single-page UI for Job Hunter, a self-hosted job-search tracker (Kanban Board, interview stages, CV, AI fit evaluation). The API, overall architecture and setup are described in the backend repository, `job-hunter-server` (README and PROJECT_STATUS.md); the Claude Desktop integration lives in `job-hunter-mcp`.

## Stack

React 19, TypeScript, Vite, MUI, TanStack Query (server state), React Router, axios, `@dnd-kit/core` (drag and drop). Tests: Vitest + Testing Library (jsdom). Lint: oxlint.

## Quick start (Docker, recommended)

You do not need Node.js or npm to use Job Hunter. Clone the three repositories side by side and run `docker compose up --build` from `job-hunter-server`; it builds this UI (see `Dockerfile` here), serves it with nginx at http://localhost:3000 and forwards `/api/` to the backend, so the browser talks to one origin. Full instructions: the **Quick Start with Docker** section of `job-hunter-server/README.md`.

In the Docker build `VITE_API_BASE_URL` is empty (same-origin requests). `docker/nginx.conf.template` holds the web server and proxy settings; `BACKEND_URL` (default `http://backend:8080`) is the upstream.

## Running locally for development

Only needed to work on the UI. Prerequisites: Node.js 20+ and npm; the backend running on `http://localhost:8080` (see "Manual development" in `job-hunter-server/README.md`; do not run it together with the Docker stack, which uses the same port).

```bash
cd job-hunter-web
npm install
npm run dev        # http://localhost:5173
```

Sign in with the account the backend created on first start, or create one with **Sign up** on the login screen.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend URL for `npm run dev`. Set it in `.env` (copy `.env.example`) only if the API runs elsewhere. Docker builds set it to empty (same origin). |

With `npm run dev`, the backend only accepts requests from the origins in its `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173`), so keep the dev server on that port or update the backend setting. Behind the Docker nginx proxy there is no cross-origin request.

## Authentication

Session-cookie based, matching the backend: logging in sets an `HttpOnly` session cookie; the readable `XSRF-TOKEN` cookie is sent back as the `X-XSRF-TOKEN` header by axios (`withXSRFToken`, see `src/api/client.ts`). Nothing is stored in `localStorage`.

- **Sign up** (`/signup`, linked from the login screen): email, password, confirmation; checked in the browser with the server's rules (`src/auth/accountRules.ts`) and again by the server. Success logs the new account in and opens its (empty) Board; server field errors (e.g. "already exists") appear next to their fields.
- **Settings → Account → Change password**: current, new, confirm. This session stays logged in; the server ends the account's other sessions.
- Passwords live only in the forms' local state: never in the TanStack Query cache (no `useMutation` for them), browser storage or URLs. A 429 shows "Too many attempts" (login, sign-up, change password).

A 401 from any API call (other than a failed login) ends the session in the UI: the app shows the login screen and clears the TanStack Query cache; logging out does the same.

## Structure

- `src/api/` — one thin module per backend area, sharing the axios client
- `src/auth/` — `AuthProvider` / `useAuth`, `RequireAuth` route guard
- `src/layout/` — app shell (header with the upcoming-stages bell, navigation)
- `src/pages/` — Login, Sign up, Board, CV, Settings (Appearance, Board columns, AI Matching, Job Search (Search Prompt and Excluded Companies), Claude / MCP, Data export/import, Account)
- `src/board/` — columns, cards, ticket drawer, Add Job / stage dialogs, filters, ordering helpers
- `src/upcoming/` — upcoming-stages bell
- `src/theme/` — MUI light/dark theme (System follows the OS)

## Commands

```bash
npm run dev       # dev server
npm test          # Vitest
npm run lint      # oxlint
npm run build     # type-check (tsc -b) + production build into dist/
npm run preview   # serve the production build
```

Build the production image on its own (the compose file in `job-hunter-server` normally does this): `docker build -t job-hunter-web .`
