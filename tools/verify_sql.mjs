/**
 * Executes the SAPI SQL against a real Postgres (PGlite, Postgres 16 compiled to
 * WebAssembly) with the Supabase runtime stubbed out.
 *
 * Why this exists: there was no way to check the SQL before pasting it into the
 * Supabase SQL Editor. `check_sql.py` only proves the files are balanced — it
 * cannot tell you that a policy references a column that does not exist, or that
 * a `security definer` function returns the wrong type. This runs the real thing
 * and reports the first failing statement with its file and line, which is what
 * you actually need when a paste fails.
 *
 * Two scenarios are run, because they are different artifacts:
 *
 *   1. The four migrations plus `seed.sql`, applied in order.
 *   2. `supabase/setup-all.sql` alone — the single file that gets pasted into
 *      the Supabase SQL Editor. It is a concatenation with the seed's own
 *      `begin;`/`commit;` stripped, so it is worth proving the concatenation is
 *      valid rather than assuming it is because the parts are.
 *
 * The stubs reproduce the parts of a Supabase project the migrations touch:
 *   - the `auth` schema, `auth.users`, and `auth.uid()`
 *   - the `anon` / `authenticated` / `service_role` roles
 *   - the default grants Supabase applies to the `public` schema
 *
 * `auth.uid()` reads `request.jwt.claim.sub`, so the RLS policies can be
 * exercised by impersonating each role — the only way to prove that a warehouse
 * clerk genuinely cannot approve their own discrepancy.
 *
 * Requires PGlite, which is not a project dependency. It is resolved from the
 * project first, then from the managed Node workspace:
 *   npm install --save-dev @electric-sql/pglite
 *   npm run verify:sql
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// PGlite may live in the project's node_modules (after `npm install
// --save-dev @electric-sql/pglite`) or in the managed Node workspace, which is
// where this environment installs tooling by default. Try both.
const requireFrom = [
  createRequire(import.meta.url),
  createRequire(
    "C:/Users/molino/.workbuddy-ai/binaries/node/workspace/package.json",
  ),
];

let PGlite;
for (const req of requireFrom) {
  try {
    ({ PGlite } = req("@electric-sql/pglite"));
    break;
  } catch {
    /* try the next root */
  }
}
if (!PGlite) {
  console.error(
    "\nThis check needs PGlite, which is not installed.\n\n" +
      "  npm install --save-dev @electric-sql/pglite\n\n" +
      "It runs a real Postgres (compiled to WebAssembly) so the migrations can be\n" +
      "executed and asserted before they are pasted into the Supabase SQL Editor.\n" +
      "Nothing else in the project depends on it.\n",
  );
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SUPABASE = join(ROOT, "supabase");

const STUBS = `
create schema if not exists auth;

do $stub$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$stub$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
  language sql stable
  as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

create or replace function auth.role() returns text
  language sql stable
  as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $fn$;

create or replace function auth.jwt() returns jsonb
  language sql stable
  as $fn$ select '{}'::jsonb $fn$;
`;

/** Supabase grants these to the API roles by default; the policies assume them. */
const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
`;

/**
 * PGlite bundles a fixed set of extensions and pgcrypto is not among them, so
 * `create extension` cannot run here even though Supabase ships several
 * pre-installed. Such statements are commented out and reported, so a skipped
 * statement is never mistaken for a passing one.
 */
const EXTENSION_RE = /^[ \t]*create[ \t]+extension\b[^;]*;[ \t]*$/gim;

const EXPECTED_COUNTS = {
  branches: 8,
  parts: 29,
  suppliers: 9,
  company_settings: 1,
  stock_records: 232,
  discrepancies: 52,
  transfers: 26,
  purchase_orders: 14,
  cycle_tasks: 64,
  profiles: 0,
  match_suggestion_dismissals: 0,
};

const MANAGER = "00000000-0000-0000-0000-000000000001";
const CLERK = "00000000-0000-0000-0000-000000000002";
const SALES = "00000000-0000-0000-0000-000000000003";
const BOGUS = "00000000-0000-0000-0000-000000000004";

let failures = 0;

function check(ok, message) {
  console.log(`  ${ok ? "\u2713" : "\u2717"} ${message}`);
  if (!ok) failures += 1;
}

/** Points at the failing statement by line number where possible. */
function locate(sql, error) {
  const text = String(error?.message ?? error);
  const match = /at or near "([^"]+)"/.exec(text) ?? /column "([^"]+)"/.exec(text);
  if (!match) return "";
  const index = sql.indexOf(match[1]);
  if (index < 0) return "";
  return ` (first occurrence of "${match[1]}" at line ${sql.slice(0, index).split("\n").length})`;
}

async function applyFiles(db, files) {
  let failed = false;
  for (const relative of files) {
    const raw = readFileSync(join(SUPABASE, relative), "utf8");

    const skipped = [];
    const sql = raw.replace(EXTENSION_RE, (match) => {
      skipped.push(match.trim());
      return `-- [harness] not executable here: ${match.trim()}`;
    });

    try {
      await db.exec(sql);
      check(true, `${relative}  (${raw.split("\n").length} lines)`);
      for (const statement of skipped) {
        console.log(`      \u26a0 skipped (PGlite ships no extensions): ${statement}`);
      }
    } catch (error) {
      check(false, `${relative} FAILED: ${error.message}${locate(raw, error)}`);
      failed = true;
    }
  }
  return !failed;
}

async function checkCounts(db) {
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
    check(rows[0].n === expected, `${table.padEnd(28)} ${rows[0].n}` + (rows[0].n === expected ? "" : `  (expected ${expected})`));
  }
}

/**
 * A fingerprint of the schema plus the data. Used to prove that re-running the
 * setup script is a no-op: if the second run duplicated a policy, re-created a
 * trigger or double-inserted a row, one of these numbers would move.
 */
async function snapshot(db) {
  const one = async (sql) => (await db.query(sql)).rows[0].n;
  const tables = {};
  for (const table of Object.keys(EXPECTED_COUNTS)) {
    tables[table] = await one(`select count(*)::int as n from public.${table}`);
  }
  return {
    tables,
    policies: await one(
      "select count(*)::int as n from pg_policies where schemaname = 'public'",
    ),
    triggers: await one(`
      select count(*)::int as n
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'auth') and not t.tgisinternal`),
    indexes: await one(
      "select count(*)::int as n from pg_indexes where schemaname = 'public'",
    ),
    types: await one(`
      select count(*)::int as n
        from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e'`),
    functions: await one(`
      select count(*)::int as n
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`),
  };
}

async function checkAnalytics(db) {
  const { rows } = await db.query("select public.rpc_discrepancy_analytics() as payload");
  const payload = rows[0].payload;

  if (!Array.isArray(payload?.byMonth)) {
    check(false, "rpc_discrepancy_analytics returned no byMonth array");
    return;
  }

  const keys = Object.keys(payload.byMonth[0] ?? {});
  const wanted = ["month", "opened", "resolved", "backlog", "cost"];
  check(
    wanted.every((k) => keys.includes(k)),
    `byMonth exposes ${wanted.join(", ")}`,
  );
  check(!keys.includes("sort_key"), "byMonth does not leak the internal sort_key");

  console.log("\n    month  opened  resolved  backlog       cost");
  for (const row of payload.byMonth) {
    console.log(
      `    ${String(row.month).padEnd(6)} ${String(row.opened).padStart(6)} ` +
        `${String(row.resolved).padStart(9)} ${String(row.backlog).padStart(8)} ` +
        `${String(Math.round(row.cost)).padStart(10)}`,
    );
  }
  console.log("");

  const opened = payload.byMonth.reduce((s, r) => s + r.opened, 0);
  const resolved = payload.byMonth.reduce((s, r) => s + r.resolved, 0);
  const identical = payload.byMonth.filter((r) => r.opened === r.resolved).length;

  check(opened === 52 && resolved === 48, `totals: opened ${opened}, resolved ${resolved}`);
  check(
    identical < payload.byMonth.length,
    `opened and resolved differ in ${payload.byMonth.length - identical} of ${payload.byMonth.length} months`,
  );
}

async function checkOtherRpcs(db) {
  const kpis = (await db.query("select * from public.rpc_dashboard_kpis()")).rows[0];
  check(Boolean(kpis), "rpc_dashboard_kpis returns a row");
  if (kpis) {
    check(kpis.total_positions === 232, `kpi positions ${kpis.total_positions}`);
    check(kpis.branch_count === 8, `kpi branch count ${kpis.branch_count}`);
    check(Number(kpis.count_accuracy) > 0, `count accuracy ${kpis.count_accuracy}%`);
  }

  const cycle = (await db.query("select * from public.rpc_cycle_summary()")).rows[0];
  check(cycle?.total_tasks === 64, `rpc_cycle_summary tasks ${cycle?.total_tasks}`);
}

async function checkRls(db) {
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${MANAGER}', 'mgr@verify.test',
        '{"role":"management","branch_id":"BR-QC","full_name":"Verify Manager","job_title":"GM"}'::jsonb),
      ('${CLERK}', 'wh@verify.test',
        '{"role":"warehouse","branch_id":"BR-QC","full_name":"Verify Clerk","job_title":"Clerk"}'::jsonb),
      ('${SALES}', 'sales@verify.test',
        '{"role":"sales","branch_id":"BR-DP","full_name":"Verify Sales","job_title":"Sales"}'::jsonb);
  `);

  const mirrored = await db.query("select role, branch_id from public.profiles order by role");
  check(mirrored.rows.length === 3, `handle_new_user() mirrored 3 users into profiles`);
  // Sort in JS: `order by role` follows the enum's declaration order
  // (management, warehouse, sales), not the alphabet.
  check(
    mirrored.rows
      .map((r) => r.role)
      .sort()
      .join(",") === "management,sales,warehouse",
    "mirrored roles are correct",
  );

  // An unknown role must fall back to the least privileged one, not fail open.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${BOGUS}', 'bogus@verify.test', '{"role":"superadmin","branch_id":"BR-NOPE"}'::jsonb);
  `);
  const bogus = (
    await db.query(`select role, branch_id from public.profiles where id = '${BOGUS}'`)
  ).rows[0];
  check(
    bogus?.role === "sales" && bogus?.branch_id === null,
    "unknown role falls back to 'sales' and unknown branch to null",
  );

  const targetTicket = (await db.query("select id from public.discrepancies limit 1")).rows[0].id;

  /** Runs a statement as `authenticated`, impersonating the given user. */
  async function asUser(userId, sql) {
    await db.exec("begin");
    try {
      await db.exec(`set local request.jwt.claim.sub = '${userId}'`);
      await db.exec("set local request.jwt.claim.role = 'authenticated'");
      await db.exec("set local role authenticated");
      const result = await db.query(sql);
      await db.exec("rollback");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }

  const clerk = await asUser(
    CLERK,
    `update public.discrepancies set status = 'Approved' where id = '${targetTicket}'`,
  );
  check(clerk.affectedRows === 0, "warehouse cannot approve a discrepancy");

  const manager = await asUser(
    MANAGER,
    `update public.discrepancies set status = 'Approved', root_cause = 'Miscount',
       reviewed_at = now() where id = '${targetTicket}'`,
  );
  check(manager.affectedRows === 1, "management can approve a discrepancy");

  const salesDelete = await asUser(SALES, "delete from public.discrepancies");
  check(salesDelete.affectedRows === 0, "sales cannot delete discrepancies");

  for (const [label, id] of [
    ["management", MANAGER],
    ["warehouse", CLERK],
    ["sales", SALES],
  ]) {
    const read = await asUser(id, "select count(*)::int as n from public.v_stock_enriched");
    check(read.rows[0].n === 232, `${label} can read all 232 stock positions`);
  }

  try {
    await asUser(CLERK, `update public.profiles set role = 'management' where id = '${CLERK}'`);
    check(false, "warehouse promoted itself to management \u2014 guard did not fire");
  } catch (error) {
    check(
      /Only management may change/.test(error.message),
      "warehouse cannot promote itself to management",
    );
  }
}

/* ── Scenario 1: the migrations and the seed, in order ───────────────────── */

console.log("\n\u2500\u2500 Scenario 1: migrations + seed.sql \u2500\u2500\n");

{
  const db = new PGlite();
  await db.exec(STUBS);
  check(true, "Supabase stubs: auth schema, auth.users, auth.uid(), roles");

  const ok = await applyFiles(db, [
    "migrations/0001_schema.sql",
    "migrations/0002_rls.sql",
    "migrations/0003_analytics.sql",
    "migrations/0004_matchmaker.sql",
    "seed.sql",
  ]);

  if (ok) {
    await db.exec(GRANTS);
    console.log("\n  Row counts\n");
    await checkCounts(db);
    console.log("\n  rpc_discrepancy_analytics()\n");
    await checkAnalytics(db);
    console.log("\n  Other RPCs\n");
    await checkOtherRpcs(db);
    console.log("\n  Row Level Security\n");
    await checkRls(db);
  }
}

/* ── Scenario 2: setup-all.sql, the file that actually gets pasted ───────── */

console.log("\n\u2500\u2500 Scenario 2: supabase/setup-all.sql (the paste target) \u2500\u2500\n");

{
  const db = new PGlite();
  await db.exec(STUBS);

  const ok = await applyFiles(db, ["setup-all.sql"]);

  if (ok) {
    await db.exec(GRANTS);
    console.log("\n  Row counts\n");
    await checkCounts(db);
    console.log("\n  rpc_discrepancy_analytics()\n");
    await checkAnalytics(db);
    console.log("\n  Row Level Security\n");
    await checkRls(db);
  }
}

/* ── Scenario 3: the re-run claim ────────────────────────────────────────── */

// `setup-all.sql` documents itself as "safe to re-run". That is a claim about
// behaviour, so it gets tested like one: apply it twice and assert the second
// run neither fails nor changes anything. This is the check that would have
// caught the unguarded `create type` / `create table` / `create policy`
// statements, each of which aborted the transaction on a second run.

console.log("\n\u2500\u2500 Scenario 3: setup-all.sql applied a second time \u2500\u2500\n");

{
  const db = new PGlite();
  await db.exec(STUBS);

  const first = await applyFiles(db, ["setup-all.sql"]);

  if (!first) {
    check(false, "first application failed \u2014 cannot test the re-run");
  } else {
    await db.exec(GRANTS);
    const before = await snapshot(db);

    console.log("\n  Re-applying the identical file\u2026\n");
    const second = await applyFiles(db, ["setup-all.sql"]);

    if (second) {
      const after = await snapshot(db);

      for (const key of Object.keys(before)) {
        const a = JSON.stringify(before[key]);
        const b = JSON.stringify(after[key]);
        check(a === b, `${key.padEnd(10)} unchanged  (${key === "tables" ? Object.keys(after.tables).length + " tables" : after[key]})`);
      }

      console.log("\n  Row counts after the re-run\n");
      await checkCounts(db);
    }
  }
}

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log("All checks passed in all three scenarios.\n");
