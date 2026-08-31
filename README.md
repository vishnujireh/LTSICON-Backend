# LTSICON Chennai 2026 — Backend

Node.js + Express + MySQL API for the conference site. Handles **abstract
submissions** and **delegate registrations**: each submission first triggers a
confirmation email via **Brevo**, then saves to MySQL.

The existing `ltsicon-frontend` is untouched. This service is standalone; wire
the frontend to it whenever you're ready (see *Connecting the frontend* below).

## Requirements

- Node.js 18+ (uses the built-in `fetch`)
- A MySQL 8+ (or MariaDB 10.5+) database

## Setup

```bash
cd ltsicon-backend
npm install
cp .env.example .env      # then edit .env with your MySQL + Brevo details
npm run init-db           # creates the database + tables (optional; also auto-runs on boot)
npm start                 # or: npm run dev  (auto-restart)
```

The server boots even if MySQL isn't reachable yet or the Brevo key is missing —
it logs a warning so you can configure `.env` and restart. Check readiness at
`GET /api/health`.

## Environment (`.env`)

| Key | Purpose |
|-----|---------|
| `PORT` | Server port (default `4000`) |
| `CORS_ORIGIN` | Comma-separated allowed origins (e.g. the Vite dev server `http://localhost:5173`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL connection |
| `DB_AUTO_INIT` | `true` to create tables automatically on boot |
| `BREVO_API_KEY` | **Paste the client's Brevo key here when provided.** Blank = emails skipped, saves still work |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Verified Brevo sender (used as the "From" on every email). `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` accepted as fallback names |
| `ADMIN_EMAIL` | Organiser inbox that gets a copy of every submission (`MAIL_ADMIN_EMAIL` accepted as fallback) |

## API

### `GET /api/health`
Returns `{ ok, db, email }` — quick readiness check.

### `POST /api/abstracts`
Accepts **`application/json`** or **`multipart/form-data`** (for the optional
`file`). An uploaded file is saved to `uploads/` on the server, attached to the
confirmation email (up to 8 MB; larger files are link-only), and reachable via
the download endpoint below.

Fields: `firstName`, `lastName`, `email`, `mobile`, `institution`, `coAuthors`,
`membershipId`, `presentationType`, `track`, `title`, `abstractBody`,
`keywords`, `declarations` (array), optional `file`.

Required: `firstName`, `lastName`, valid `email`, `mobile`, `institution`,
`presentationType`, `track`, `title`.

### `GET /api/abstracts/file/:name`
Downloads a previously uploaded abstract file (served with its original
filename). The link is included in the confirmation email. Set `PUBLIC_BASE_URL`
in `.env` (e.g. your deployed domain) so the emailed link points at the right
host; it defaults to `http://localhost:<PORT>`.

```bash
curl -X POST http://localhost:4000/api/abstracts \
  -H 'content-type: application/json' \
  -d '{"firstName":"Asha","lastName":"Rao","email":"asha@example.org",
       "mobile":"+91 99999 88888","institution":"Apollo","presentationType":"Oral",
       "track":"Hepatology","title":"My abstract","declarations":["original"]}'
```

Response: `201 { ok, id, emailStatus, message }`.

### `POST /api/registrations`
Accepts JSON matching the frontend registration form:

Fields: `name`, `email`, `phone`, `designation`, `institution`, `address`,
`mciNumber`, `mciState`, `category`, `workshops` (array), `guests` (array of
`{name, mobile}`), `currency`, `totalAmount`, `phase`, optional `reference`
(auto-generated if omitted).

Required: `name`, valid `email`.

Re-posting the same `reference` updates the existing row (lead capture is
idempotent). Response: `201 { ok, id, reference, emailStatus, message }`.

### `PUT /api/registrations/:reference`
Payment confirmation for an existing registration. Fills in `category`,
`workshops`, `guests`, `currency`, `totalAmount`, `phase`, marks it paid, and
sends the **"Registration confirmed"** email. If the lead row doesn't exist yet
it is created. Response: `200 { ok, reference, paymentStatus, emailStatus, message }`.

`emailStatus` is one of `sent` | `skipped` (no key) | `failed`; it never blocks
the DB save.

## Frontend integration (already wired)

The frontend now calls this API through `src/lib/api.js`:

- **Abstract form** (`components/Abstracts.jsx`) is a working form that POSTs to
  `/api/abstracts` (multipart when a file is attached).
- **Registration** (`components/RegisterPage.jsx`) POSTs a lead to
  `/api/registrations` at step 1, then confirms via
  `PUT /api/registrations/:reference` on payment.

All calls are best-effort — if the backend is offline the existing
localStorage flow still works, so the site never breaks.

Set the API origin for the frontend build with `VITE_API_BASE`
(defaults to `http://localhost:4000`), e.g. create `ltsicon-frontend/.env`:

```
VITE_API_BASE=http://localhost:4000
```

Point `CORS_ORIGIN` (backend `.env`) at the frontend origin — e.g.
`http://localhost:5173` for Vite dev — so the browser is allowed to call it.

## Data model

Two tables, `abstracts` and `registrations` (see `src/db/schema.sql`). Array
fields (declarations, workshops, guests) are stored as JSON columns.
