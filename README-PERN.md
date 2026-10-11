# SAPI — Integrated Inventory Reconciliation, Auditing & Decision Support System

A PERN-stack implementation of the Southwind Automotive Parts Inc. (SAPI) capstone
proposal, with **Supabase** providing PostgreSQL, authentication and Row Level
Security.

> **PERN** = PostgreSQL · Express · React · Node.

---

## 1. What this system does

The proposal defines four objectives. Each one maps to a concrete module:

| # | Objective (from the proposal) | Where it lives |
|---|---|---|
| 1 | **Targeted cycle counting** — rank stock positions by risk and issue printable *blind count* sheets | `shared/cycleCount.ts`, `src/app/pages/CycleCountPage.tsx`, `src/app/components/reconciliation/BlindCountSheet.tsx` |
| 2 | **Discrepancy approval workflow with record locking** — an encoded count that disagrees freezes the record and raises a ticket | `supabase/migrations/0001_schema.sql` (`locked_by_discrepancy`), `server/src/routes/cycleTasks.ts`, `server/src/routes/discrepancies.ts` |
| 3 | **Discrepancy analytics dashboard** — variance by month, branch and root cause | `supabase/migrations/0003_analytics.sql`, `server/src/services/analytics.ts`, `src/app/pages/AnalyticsPage.tsx` |
| 4 | **Automated dead-stock matchmaker** — pair dead stock in one branch with a shortage in another | `shared/matchmaker.ts`, `server/src/services/matchmaker.ts`, `src/app/pages/MatchmakerPage.tsx` |

The **no-phone warehouse policy** from the proposal is why counts are captured on
paper and encoded later — the blind sheet deliberately omits every system
quantity so a clerk cannot simply copy the number off a screen.

---

## 2. Architecture

```
┌──────────────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│  React client        │  /api  │  Express API          │        │  Supabase        │
│  (Vite, :8443)       │ ─────► │  (Node, :4000)        │ ─────► │  Postgres + Auth │
│                      │        │                       │        │                  │
│  supabase-js         │        │  per-request client   │        │  Row Level       │
│  (auth only)         │        │  carrying caller JWT  │        │  Security        │
└──────────────────────┘        └───────────────────────┘        └──────────────────┘
```

Three deliberate choices:

- **Authorization is Row Level Security, not Express middleware.** Every table
  has RLS enabled. `requireRole` on the server exists only to return a friendly
  `403` instead of a raw Postgres error — the database is the real boundary. If
  the two ever disagree, the database wins.
- **One bootstrap request.** The client hydrates the whole workspace from
  `GET /api/bootstrap` rather than ~13 parallel calls, then re-reads that same
  snapshot after every write. Because KPIs, analytics and matchmaker suggestions
  are all computed server-side, re-reading guarantees the derived figures agree
  with the rows they came from.
- **A shared rules layer.** `shared/` holds the domain types, the cycle-count
  ranking and the matchmaker logic, and is imported by *both* the Express server
  and the React client, so the two tiers cannot drift apart.

### Two Supabase clients on the server

| Client | Key | Purpose |
|---|---|---|
| `supabaseAdmin` | `service_role` | Token verification, seeding, user provisioning. Bypasses RLS — used only where that is the point. |
| `clientForToken(token)` | `anon` + caller's JWT | Every data read/write. RLS applies as the signed-in user. |

Handlers always use the per-request client, so a route cannot accidentally
escalate privileges by forgetting a check.

---

## 3. Roles

Three roles, matching the proposal's staffing model.

| Capability | Management | Warehouse | Sales |
|---|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ |
| Cross-branch stock availability | ✓ | ✓ | ✓ |
| Targeted cycle counts / blind sheets | ✓ | ✓ | — |
| Encode a physical count | ✓ | ✓ | — |
| Raise a discrepancy ticket | ✓ | ✓ | — |
| **Approve / reject a discrepancy** | ✓ | — | — |
| Dead-stock matchmaker | ✓ | ✓ | — |
| Request a transfer | ✓ | ✓ | ✓ |
| Execute a transfer (advance its status) | ✓ | ✓ | — |
| Purchase orders | ✓ | — | — |
| Suppliers & settings | ✓ | — | — |
| Discrepancy analytics | ✓ | — | — |

Notably, **warehouse staff cannot approve their own discrepancy tickets.** There
is deliberately no `update` policy for them on `discrepancies`; a locked ticket
stays locked until management rules on it. That separation is the whole point of
the audit trail.

After signing in, each role lands where it works: sales → Inventory,
warehouse → Cycle Counts, management → Dashboard.

---

## 4. Setup

### Prerequisites

- Node.js 22+
- A Supabase project. This build is wired for
  `https://szlqwcmmwveunelktlqm.supabase.co`.

### Step 1 — Create the schema and load the data

Open **Supabase Dashboard → SQL Editor → New query**, paste the entire contents
of **`supabase/setup-all.sql`**, and run it. That single file contains all four
migrations *and* the seed, in the one order that works.

It ends with a self-check query that returns a 10-row summary table:

```text
table_name       | count
-----------------+------
branches         | 8
company_settings | 1
cycle_tasks      | 64
discrepancies    | 52
parts            | 29
profiles         | 0
purchase_orders  | 14
stock_records    | 232
suppliers        | 9
transfers        | 26
```

(`profiles` stays 0 until Step 4 creates the login accounts.)

Everything runs inside one transaction, so if any statement fails the database
rolls back to its previous state instead of being left half-built. It is also
safe to re-run: every type, table, index, trigger and policy is guarded
(`if not exists`, or a `drop … if exists` first), reference tables are upserted,
and transactional rows are only inserted when absent — so in-progress work is
never clobbered. `npm run verify:sql` applies the file twice and asserts nothing
changes; `npm run check:idempotent` checks the guards statically.

> **Why one file?** The seed inserts into tables the migrations create, so
> running the seed on its own fails with
> `42P01: relation "public.branches" does not exist`. Combining them removes the
> ordering mistake entirely.

<details>
<summary>Prefer to run them separately?</summary>

Paste these **in this order** — later files depend on earlier ones:

1. `supabase/migrations/0001_schema.sql` — enums, tables, triggers
2. `supabase/migrations/0002_rls.sql` — helper functions and RLS policies
3. `supabase/migrations/0003_analytics.sql` — views and RPC functions
4. `supabase/migrations/0004_matchmaker.sql` — suggestion dismissal ledger
5. `supabase/seed.sql` — the dataset

`0002` creates policies over the tables `0001` defines, and `0003`'s views
depend on both.
</details>

> **Regenerate the combined file** after changing anything under
> `src/app/data/`:
>
> ```bash
> npm run server:seed && npm run server:setup
> # or inside server/:
> cd server && npm run seed:sql && npm run setup:sql
> ```
>
> *(On Windows PowerShell 5.1, replace `&&` with `;` or run the root `npm run server:setup` script).*
>
> **Alternative:** `npm --prefix server run seed:push` pushes the data over the REST
> API using the service-role key — but the schema still has to exist first.

#### Checking the SQL before you paste it

The SQL Editor gives you one shot and a terse error. Two local checks exist so you
never have to guess:

```bash
npm run check:sql         # balance of parens / dollar-quotes, no dependencies
npm run check:idempotent  # every type/table/index/trigger/policy is guarded
npm run verify:sql        # actually runs the SQL (needs PGlite, see below)
```

`check:sql` is a fast structural check. `check:idempotent` statically scans the
migrations for DDL that would fail on a second run — a bare `create type`,
`create table` without `if not exists`, a `create policy` with no matching
`drop policy`, and so on. It is comment- and dollar-quote-aware, so the guarded
types inside the `do $enums$` block are not false-flagged.

`verify:sql` is the useful one: it runs a real Postgres (PGlite, Postgres 16
compiled to WebAssembly) with the Supabase runtime stubbed — `auth.users`,
`auth.uid()`, the three API roles and their default grants — then asserts:

- every file applies without error, reporting the failing line if not
- row counts match the table in Step 1
- the RPCs return the shape the client deserialises, including `backlog`
- `handle_new_user()` mirrors auth users into `profiles`, and falls back to
  `sales` when the metadata carries an unknown role
- RLS actually holds: warehouse **cannot** approve a discrepancy, management
  **can**, sales cannot delete, all three can read stock across branches, and a
  warehouse clerk cannot promote themselves
- **applying `setup-all.sql` a second time is a no-op** — it runs the whole file
  again and asserts the row counts, policies, triggers, indexes, types and
  functions are all unchanged. This is what proves the "safe to re-run" claim
  below rather than merely asserting it.

It runs three scenarios — the migrations plus `seed.sql`, `supabase/setup-all.sql`
on its own, and `setup-all.sql` twice — since that concatenation is the artifact
you paste.

PGlite is not a project dependency; install it only if you want this check:

```bash
npm install --save-dev @electric-sql/pglite
```

PGlite ships a fixed set of extensions, so any `create extension` line is skipped
and reported. The migrations deliberately contain none — see
[Notable database design decisions](#7-notable-database-design-decisions).

#### Applying it without the SQL Editor

The SQL Editor is fine, but pasting 1,700 lines by hand is easy to get wrong —
a truncated paste or a wrong-project paste both fail in ways that look like
"nothing happened". You can apply the same file straight from the command line
and get a real verification report back:

```bash
SUPABASE_DB_PASSWORD='...' npm run db:apply
```

If you would rather not use the database password, create a **personal access
token** at <https://supabase.com/dashboard/account/tokens> and use that instead:

```bash
SUPABASE_ACCESS_TOKEN='sbp_...' npm run db:apply -- --token
```

Either route applies the file, prints the self-check counts, and then asserts the
eleven tables, the four views, the three RPCs and the RLS state. Add `--check` to
verify a database that has already been set up without touching it.

`npm run db:probe` finds which pooler host actually carries the project, if the
connection settings are ever in doubt — see the note below.

> **Why a pooler and not the direct host?**
> `db.<project-ref>.supabase.co` is **IPv6-only** on current Supabase projects.
> On a network without an IPv6 route, connecting to it fails with
> `getaddrinfo ENOTFOUND` even though DNS is working. The connection pooler
> (`aws-<n>-<region>.pooler.supabase.com`) is dual-stack and always reachable, so
> the tooling uses it. The pooler also requires the username in the form
> `postgres.<project-ref>`; a bare `postgres` is rejected with
> `ENOIDENTIFIER no tenant identifier provided`.

### Step 2 — Configure the environment

Copy the example configuration files:

**Bash / Linux / macOS:**
```bash
cp .env.example .env
cp server/.env.example server/.env
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

Fill in both files from **Supabase Dashboard → Project Settings → API**:

| File | Variable | Required | Value |
|---|---|:---:|---|
| `.env` | `VITE_SUPABASE_URL` | Yes | your project URL (already set) |
| `.env` | `VITE_SUPABASE_ANON_KEY` | Yes | the **anon / publishable** key |
| `.env` | `VITE_API_URL` | No | `/api` (leave as-is; proxied by Vite) |
| `server/.env` | `SUPABASE_URL` | Yes | your project URL (already set) |
| `server/.env` | `SUPABASE_ANON_KEY` | Yes | the **anon / publishable** key |
| `server/.env` | `SUPABASE_SERVICE_ROLE_KEY` | Yes | the **service_role / secret** key |

*Optional `server/.env` settings:* `PORT` (defaults to `4000`), `CORS_ORIGIN` (defaults to `http://localhost:8443,http://127.0.0.1:8443,http://localhost:5173,http://127.0.0.1:5173`), `SAPI_AS_OF` (fixed dataset snapshot date, defaults to `2026-10-11`), and `NODE_ENV` (`development`).

The anon key is safe in the browser — on its own it grants nothing, because
every table is protected by RLS. The **service-role key must never leave the
server** and must never be committed.

> **If a key has been shared or committed, rotate it.** Both keys live under
> *Project Settings → API*, and the legacy JWT secret under *Project Settings →
> API → JWT Settings*. The service-role key bypasses RLS entirely, and the JWT
> secret lets anyone mint a valid token for your project — treat either one as
> compromised the moment it appears anywhere outside `server/.env`. Rotating the
> JWT secret invalidates existing sessions and requires re-running
> `npm run server:provision`.

> Leaving the two `VITE_` values blank runs the client in **offline demo mode**
> against the bundled dataset, with no API and no database. Useful for a quick
> UI walkthrough, but nothing persists.

### Step 3 — Install dependencies

From the repository root:

```bash
npm install
npm --prefix server install
```

*(Or run `cd server && npm install && cd ..`, replacing `&&` with `;` in Windows PowerShell).*

### Step 4 — Create the login accounts

From the repository root:

```bash
npm run server:provision
```

*(Or from the `server/` directory: `cd server && npm run provision && cd ..`).*

This creates Supabase Auth users through the Admin API. Auth users cannot be
created reliably from the SQL Editor, so this step is not optional. Each account
is created with `role` and `branch_id` metadata, which a trigger
(`on_auth_user_created`) copies into `public.profiles` — the table every RLS
policy reads. The script is re-run tolerant.

> **Order does not matter.** The trigger only fires on INSERT, so if the accounts
> were created *before* the schema existed — the usual outcome of running this
> step first and `setup-all.sql` second — no profile rows are written and every
> login is refused with a 403, because RLS cannot resolve a role. This script
> repairs that: it reads every auth user, compares against the existing profiles,
> and **inserts** the missing rows rather than trying to update them. It reports
> the repair as `back-filled N` so the condition is visible, not silent.

To set a custom password for the created accounts:
- **Bash:** `SEED_PASSWORD="CustomPassword123" npm run server:provision`
- **PowerShell:** `$env:SEED_PASSWORD="CustomPassword123"; npm run server:provision`
- **CMD:** `set SEED_PASSWORD=CustomPassword123 && npm run server:provision`

### Step 5 — Run it

Open two terminal windows:

**Terminal 1 — Express API** (http://localhost:4000):
```bash
npm run server:dev
# or: cd server && npm run dev
```

**Terminal 2 — Vite Client** (http://localhost:8443):
```bash
npm run dev
```

Then open **http://localhost:8443**.

The Vite dev server proxies `/api` to `http://127.0.0.1:4000`, so the browser
stays same-origin and there is no CORS preflight in development.

---

## 5. Demo accounts

Password for all three: **`Southwind#2026`**

| Email | Role | Home branch |
|---|---|---|
| `manager@southwind.com.ph` | Management | Quezon City |
| `warehouse@southwind.com.ph` | Warehouse | Quezon City |
| `sales@southwind.com.ph` | Sales | Quezon City |

Signing in as each one is the fastest way to see the role separation work — the
navigation, the buttons and the available data all change.

---

## 6. Project layout

```
.
├── shared/                     # Imported by BOTH tiers — one source of truth
│   ├── types.ts                #   the domain model
│   ├── cycleCount.ts           #   Objective 1 — ranking + sheet building
│   ├── matchmaker.ts           #   Objective 4 — dead-stock pairing
│   └── permissions.ts          #   the presentation-layer role matrix
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql     # tables, enums, generated columns, triggers
│   │   ├── 0002_rls.sql        # helper functions + every RLS policy
│   │   ├── 0003_analytics.sql  # security_invoker views + RPC functions
│   │   └── 0004_matchmaker.sql # dismissal ledger
│   ├── seed.sql                # generated — do not edit by hand
│   └── setup-all.sql           # complete setup: all migrations + seed in one script
│
├── server/                     # Express API
│   ├── src/
│   │   ├── index.ts            # helmet, CORS, mounts, error handlers
│   │   ├── env.ts              # environment variables & validation
│   │   ├── supabase.ts         # the two clients (admin & token-scoped)
│   │   ├── middleware/auth.ts  # requireAuth / requireRole
│   │   ├── routes/             # one file per resource
│   │   ├── services/           # business logic + Postgres access
│   │   └── db/types.ts         # row interfaces and mappers
│   └── scripts/
│       ├── seed-rows.mts       # the single seed definition
│       ├── generate-seed.mts   # → supabase/seed.sql
│       ├── build-setup.mts     # → supabase/setup-all.sql
│       ├── push-seed.mts       # → Supabase over REST
│       └── provision-users.mts # → Supabase Auth users
│
└── src/app/                    # React client
    ├── auth/                   # AuthProvider, RequireAuth, RequireRole
    ├── store/                  # SystemStore — the one data source
    ├── pages/                  # one file per route
    ├── components/             # ui/ primitives, layout/, reconciliation/
    ├── lib/                    # api.ts, supabase.ts (auth client), formatters
    └── data/                   # bundled dataset (offline demo mode only)
```

---

## 7. Notable database design decisions

**Generated stored columns.** `discrepancies.variance` and
`discrepancies.variance_value` are `generated always as ... stored`, so the
evidence behind an approval is computed once and cannot be silently
recalculated later.

**A coherence constraint on review state.** Approval requires a root cause and a
review timestamp; rejection requires a timestamp but forbids a root cause:

```sql
constraint discrepancy_review_coherent check (
  (status = 'Approved' and root_cause is not null and reviewed_at is not null)
  or (status in ('Locked', 'Under Review'))
  or (status = 'Rejected' and reviewed_at is not null)
)
```

**`security definer` helper functions.** A policy on `profiles` that queried
`profiles` would recurse infinitely. `auth_role()`, `auth_branch_id()`,
`is_management()` and friends are `security definer` precisely to break that
cycle.

**A privilege-escalation guard.** A user may edit their own profile — so without
a guard they could promote themselves to `management`. A
`prevent_profile_escalation()` trigger rejects any change to `role` or
`branch_id` unless the caller is already management.

**No extensions, on purpose.** The schema depends on nothing beyond core
Postgres. Primary keys are natural keys (branch id, SKU, ticket id) or are
supplied by Supabase Auth, so there is no `gen_random_uuid()` call and no
`pgcrypto`. An earlier revision ran `create extension if not exists "pgcrypto"`
out of habit; nothing used it, and because the whole script is a single
transaction, a failure there would have rolled back the entire migration. It was
removed rather than left in as a single environmental point of failure. Keep it
that way unless something genuinely needs an extension — and if it does, install
it into the `extensions` schema (`with schema extensions`), not `public`.

**`security_invoker = true` views.** Views default to running as their *owner*,
which silently bypasses RLS. Every view here sets `security_invoker = true` so
the caller's policies apply.

**A partial unique index as a backstop.** One live cycle task per position:

```sql
create unique index cycle_tasks_position_key
  on public.cycle_tasks (sku, branch_id) where status <> 'Reconciled';
```

**Two honest metrics, not one.** *Count accuracy* is the share of positions with
a clean count record; *stock health* is the share at or above their reorder
point. Blending them produces a number that means nothing, so they are reported
separately.

---

## 8. Regenerating the seed data

The bundled dataset under `src/app/data/` is the single input for both the SQL
seed file and the offline demo mode. After changing any of it:

**From repository root:**
```bash
npm run server:seed     # rewrite supabase/seed.sql
npm run server:setup    # rebuild supabase/setup-all.sql
```

**Or inside `server/`:**
```bash
cd server
npm run seed:sql        # rewrite supabase/seed.sql
npm run setup:sql       # rebuild supabase/setup-all.sql
npm run seed:push       # or push straight to Supabase over REST
```

Both consume `scripts/seed-rows.mts`, so the two routes into the database cannot
drift apart. The data is deterministic — a fixed-seed LCG generates the stock
levels — so figures are reproducible across machines.

---

## 9. Troubleshooting

**`The token '&&' is not a valid statement separator in this version` on Windows PowerShell.**

Default Windows PowerShell 5.1 does not support `&&` chaining. Use `;` to separate statements (e.g., `cd server; npm run dev`) or use the root convenience commands (`npm run server:dev`, `npm run server:provision`, `npm run server:setup`).

**`Cannot find module '@rollup/rollup-win32-x64-msvc'` (or the esbuild
equivalent) when running the build.**

This is a known npm bug on Windows: if the optional platform binary fails to
extract — usually a file lock from an antivirus scanner or a running dev server
— npm records its absence and never retries. Both packages are declared in
`optionalDependencies` so a normal `npm install` restores them, but if you hit
it anyway:

```bash
npm install --no-save "@rollup/rollup-win32-x64-msvc@4.64.5" "@esbuild/win32-x64@0.25.12"
```

Stop any running dev server first, so nothing holds a lock on the `.node` files.

**Port conflict (`EADDRINUSE: address already in use :::4000` or `:::8443`).**

- Express API (port 4000): Set `PORT=4001` in `server/.env`, and set `API_PROXY_TARGET=http://127.0.0.1:4001` in your root `.env` so Vite proxies to the new port.
- Vite dev server (port 8443): Specify a different port when launching, e.g. `PORT=8444 npm run dev` (or `$env:PORT="8444"; npm run dev` in PowerShell).

**The client loads but every request 403s.** The account exists in
`auth.users` but has no matching row in `profiles`. Run `npm run server:provision`
(or `npm run provision` in `server/`).

**`duplicate_object` / `type "user_role" already exists` when applying the SQL.**

You are applying a revision of `setup-all.sql` from before the idempotency fix.
Every `create type`, `create table`, `create index`, `create trigger` and
`create policy` is now guarded, so re-applying is a no-op. If you see this from a
newer file, run `npm run check:idempotent` — it names the offending statement and
line. Note that because the whole file is one transaction, this error rolls the
run back completely: the database is left exactly as it was, so it is safe to fix
and retry.

**`profiles` is empty but `auth.users` has rows.**

The `on_auth_user_created` trigger only fires on INSERT. If you provisioned the
accounts before applying the schema — which is the natural order if you ran
Step 4 first — the trigger never saw them. `npm run server:provision` now repairs
this: it inserts the missing rows and reports `back-filled N`. An older revision
only attempted an `UPDATE`, which matched zero rows and silently left every
account locked out.

**`Could not load system data` on the login screen.** The Express API is not
running, or `server/.env` is missing `SUPABASE_SERVICE_ROLE_KEY`. Check
`http://localhost:4000/api/health`.

**`42P01: relation "public.branches" does not exist` when running the seed.**
The migrations have not been applied. The seed inserts into tables the migrations
create, so it must run *after* them — which is exactly what `supabase/setup-all.sql`
handles in one paste. Re-run Step 1.

**You ran `setup-all.sql` but the tables still are not there.**

The whole script is one transaction, so a single failing statement rolls back
*everything* and leaves the database exactly as it was — the tables will not
exist even though the script "ran". Two things to check:

1. **Did the SQL Editor report an error?** It prints the failing statement and a
   message. A success shows `Success. No rows returned` followed by the 10-row
   count table from Step 1. If you did not see that table, it did not succeed.
2. **Was it the right project?** Confirm which project you are querying by
   running this in the same SQL Editor tab:

   ```sql
   select current_database(),
          (select count(*) from information_schema.tables
           where table_schema = 'public') as public_tables;
   ```

   If `public_tables` is 0, the schema is not in *that* project.

You can verify the SQL itself is sound before pasting with `npm run verify:sql`
(see Step 1) — it applies the exact same file to a real Postgres locally.

**`password authentication failed for user "postgres"` (SQLSTATE `28P01`) when
applying from the command line.**

The database password is not the same thing as your Supabase account password.
`28P01` means the pooler *found* the project and forwarded the login to Postgres,
which then rejected the credential — so the host, port and username format are
all correct and only the password is wrong. Fix it one of two ways:

1. **Reset the database password** — Dashboard → Project Settings → Database →
   Reset database password — then re-run `npm run db:apply` with the new value.
2. **Skip the password entirely** — create a personal access token at
   <https://supabase.com/dashboard/account/tokens> and run
   `SUPABASE_ACCESS_TOKEN='sbp_...' npm run db:apply -- --token`.

A *service-role key* and a *legacy JWT secret* will not work for either route.
The service-role key is a PostgREST credential, and `api.supabase.com` rejects it
with `401 JWT failed verification`; only a real `sbp_` token is accepted there.

**`(ENOIDENTIFIER) no tenant identifier provided` from the pooler.**

The pooler needs the tenant in the username: use `postgres.<project-ref>`, not a
bare `postgres`.

**`getaddrinfo ENOTFOUND db.<project-ref>.supabase.co`.**

That host is IPv6-only on current projects and your network has no IPv6 route.
Use the pooler instead — `npm run db:probe` will find the right one.

**Blank data after signing in.** The migrations or seed have not been applied to
this project. Re-run Step 1.

**The UI shows the bundled dataset even though Supabase is configured.** Check
that both `VITE_` values are present in the root `.env` and restart the Vite dev
server — Vite only reads `.env` at startup.

---

## 10. Known limitations

- **The data is seeded mock data**, generated to match the proposal's eight
  branches. It is not real SAPI inventory.
- **`pnpm-lock.yaml` is stale.** npm was used for this build and wrote
  `package-lock.json`. Delete the pnpm lockfile if you are not using pnpm.
- **Settings screens are presentational.** The toggles on the Audit &
  Notifications tab illustrate the policy configuration but are not yet persisted
  to `company_settings`.
- **No automated test suite.** Verification was done by type-checking both tiers,
  a production build, and exercising all eleven routes against the live database.
