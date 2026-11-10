# Gradebook

A student grading workspace built with Vite and React, backed by PostgreSQL/Neon through Netlify Functions. It includes a separate browser demo for trying the complete interface without a database.

## Features

- Marks register, student and subject directories, results, and performance summaries.
- Add, search, view, edit, and delete results; confirmed deletion and browser printing.
- Test 1 (20%), Test 2 (30%), and final examination (50%), entered out of 100.
- Live grade previews and database-calculated totals; pending marks remain distinct from recorded zeros.
- Connection menu: test a Neon URL, select a database for the current browser session, initialize the workspace, and create its first educator account.
- Password-hashed cloud login, revocable sessions, account-scoped data, CSRF checks, and login throttling.
- Page, grade-preview, progress-bar, and dialog animations with reduced-motion support.
- Responsive layouts and explicit loading, empty, validation, error, and saved states.

## Run locally

Use Node.js 22.12+ (Node.js 24 is selected for Netlify builds).

```sh
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. Choose **Explore browser demo** for synthetic students, subjects, and marks saved only in this browser. Demo access is not authentication and never grants access to cloud records. Clearing site storage removes demo changes. Demo records are not automatically copied to a connected database.

## Connect Neon

1. The server needs one private `GRADING_SESSION_SECRET` (32+ characters) to encrypt connection cookies. Generate it with `openssl rand -hex 32` and set it in `.env` locally or Netlify environment variables. The test deployment already has this configured. No workspace setup key is required. Never use a `VITE_` prefix for secrets; redeploy after changing hosted values.
2. Open **Connections**. Paste the connection URL from the Neon project's **Connect** menu, including its database username and password. A pooled endpoint is suitable for the serverless app.
3. Click **Test connection**. Possession of valid database credentials authorizes the connection. This checks the database with read-only queries and reports its endpoint, database, response time, and workspace status. It creates no tables.
4. Click **Use this database**. The URL is encrypted with AES-256-GCM and kept in an HttpOnly, SameSite=Strict cookie for up to eight hours; it is not stored in local storage, returned to the UI, or included in the Vite bundle. Connecting clears an existing cloud session.
5. For a new workspace, enter your educator name, email, and account password, then choose **Initialize workspace**. The app creates objects only inside the `gradebook` schema and creates the first educator account. It does not alter other schemas. Use a dedicated database or Neon test branch when trying setup.
6. Sign in with the educator account. Only this account's students, subjects, and results are accessible through the app.

The URL field accepts Neon endpoints on port 5432. For another PostgreSQL host, set `DATABASE_URL` on the server. Signed-in API clients can inspect that configured connection; the connection form requires a URL to establish initial access. For non-Neon cloud hosts, use the SQL export and a trusted server-side administration flow to create your account. Remote connections require trusted TLS certificates; URL parameters cannot disable certificate verification. Local loopback PostgreSQL requires the explicit development-only `GRADING_ALLOW_LOCAL_DB=true` setting.

The connection URL itself provides database access. Initial account creation requires a connection cookie issued after verifying those credentials; an anonymous visitor cannot initialize a server-configured database just by visiting the site. Session-secret rotation invalidates saved connection cookies. Signing out revokes the login session; it does not remove the selected connection cookie. **Disconnect this browser** clears both cookies; a server-configured `DATABASE_URL` remains available as the default.

`DATABASE_URL` is the recommended persistent default for shared deployments: put it in Netlify environment variables and redeploy so each browser does not need to select a connection. The optional browser selection overrides that default for its session.

## Deploy on Netlify

Deploy this repository with the supplied `netlify.toml`:

- Build: `npm run build`
- Publish directory: `dist`
- Functions: `netlify/functions`
- Server secrets: `GRADING_SESSION_SECRET` and optionally `DATABASE_URL`

Use the Netlify Git integration or CLI to deploy the frontend **and** Functions. A static drag-and-drop upload of `dist` supports the browser demo but does not deploy the database API. Only generated frontend files go in `dist`; the PHP router, configuration, SQL, tests, and local reference files are not copied there. API requests are routed by the configured `/api/*` rewrite before the SPA fallback.

```sh
npm run build
npx netlify deploy --prod --no-build --dir dist --functions netlify/functions
```

No existing PHP/MySQL data is migrated automatically. The PHP implementation remains available separately; see [PHP setup](docs/php-setup.md). The user requested the Vite/PostgreSQL version as an additional hosting path.

## Grading and performance

`total = round(test_1 × 0.20 + test_2 × 0.30 + final_exam × 0.50, 2)`

Input marks accept 0–100 and at most two decimal places. PostgreSQL uses exact NUMERIC arithmetic. The client preview uses integer hundredths. Totals are rounded to two decimals before grading: A ≥80, B ≥65, C ≥50, D ≥40, E below 40. Blank assessments stay pending until all three marks are recorded. Completed results below 40 are highlighted for support.

Performance summaries filter by academic term. Averages and pass rates include only completed results, with completion counts shown. Each result has equal weight; this is not a credit-weighted GPA or a longitudinal trend metric.

## Database

The PostgreSQL schema lives in `server/schema.mjs`. The matching [SQL export](database/postgres.sql) can be run in Neon's SQL editor; `npm run schema` regenerates that export. Importing SQL creates the tables but does not create a staff account; finish first-account setup in Connections. `database_schema.sql` is the independent MySQL/MariaDB schema for the retained PHP app.

A result links one student and one subject in a named term, unique for that combination. Composite foreign keys prevent cross-account links. The backend always scopes data by the authenticated account; views alone do not enforce row-level security. Deleting a result preserves the student and subject. Student/subject edits appear on linked results. Login sessions live in PostgreSQL and expire after eight hours; after five failed logins an account is locked for fifteen minutes.

## Verification

```sh
npm test
npm run build
```

The default tests cover grading boundaries, malformed marks, demo mutations, schema-export parity, connection host/TLS validation, password hashing, and encrypted-cookie integrity/expiry. Database integration tests are skipped by default to avoid touching an arbitrary database.

Against an isolated loopback PostgreSQL database with the server variables in `.env`:

```sh
GRADING_TEST_ALLOW_WRITES=1 node --env-file=.env --test tests/postgres.test.mjs
```

With `npm run dev` running against that same disposable database, test through the actual HTTP/Functions path:

```sh
GRADING_TEST_ALLOW_WRITES=1 GRADING_TEST_URL=http://127.0.0.1:5173 node --env-file=.env --test tests/postgres.test.mjs
```

The integration test initializes an empty workspace, creates disposable accounts, checks cloud login and CRUD, grade boundaries, CSRF, cross-origin rejection, ownership, logout revocation, and throttling, then deletes only its own fixtures. Do not run it against a real shared workspace. Successful local PostgreSQL checks do not prove a live Neon connection; verify the hosted connection and persistence after supplying an actual Neon URL.

## Limits

There is no password reset, institutional SSO, shared-staff administration, automatic MySQL migration, immutable report snapshot, or full marks edit history. The connection wizard creates the first educator only; later account administration is not implemented. Database deletion is permanent. No real student data is bundled.

The production dependency audit reported no advisories. The current Netlify development-tool dependency tree has upstream advisories; a force downgrade was not applied. These packages are used for local/build tooling, not imported into the deployed frontend or grading API.

References: [Neon Node.js connection guide](https://neon.com/docs/guides/node), [Vite on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/), and [Netlify Functions](https://docs.netlify.com/build/functions/api/).
