/**
 * Creates the Supabase Auth accounts and guarantees each one has a matching
 * `profiles` row.
 *
 *   npm run provision
 *
 * Auth users cannot be created from the SQL Editor reliably, so they are made
 * through the Admin API. Each user is created with `role` and `branch_id` in
 * their metadata; the `on_auth_user_created` trigger in 0001_schema.sql copies
 * those into `public.profiles`, which is what every RLS policy reads.
 *
 * That trigger only fires on INSERT. If the accounts were created before the
 * schema existed — the normal outcome of running `provision` first and
 * `setup-all.sql` second — no profile rows are written and every login is
 * locked out with a 403, because RLS cannot resolve a role. This script
 * therefore does not merely report that mismatch: it repairs it.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS, USERS } from "../../src/app/data/users";
import type { UserRole } from "../../shared/types";

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const password = process.env.SEED_PASSWORD?.trim() || "Southwind#2026";

if (!url || !serviceKey) {
  console.error(
    "\n  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Copy server/.env.example to server/.env and fill both in.\n",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Account {
  email: string;
  name: string;
  role: UserRole;
  branchId: string;
  jobTitle: string;
}

/** The demo logins first, then the full staff roster. */
const accounts: Account[] = [
  ...DEMO_ACCOUNTS.map((a) => ({
    email: a.email,
    name: a.name,
    role: a.role,
    branchId: a.branchId,
    jobTitle: a.jobTitle,
  })),
  ...USERS.filter((u) => !DEMO_ACCOUNTS.some((d) => d.email === u.email)).map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    branchId: u.branchId,
    jobTitle: roleTitle(u.role),
  })),
];

function roleTitle(role: UserRole): string {
  if (role === "management") return "Branch Manager";
  if (role === "warehouse") return "Warehouse Staff";
  return "Sales Staff";
}

/**
 * `profiles.id` is the auth user's id, so a back-fill needs the id and not just
 * the email. Auth users are paginated, so walk every page.
 */
async function loadAuthUserIds(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const perPage = 200;

  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);

    for (const user of data.users) {
      if (user.email) ids.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < perPage) break;
  }
  return ids;
}

/** Ids that already have a profile row, so a repair can be reported as one. */
async function loadExistingProfileIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("profiles")
      .select("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read profiles: ${error.message}`);

    for (const row of data ?? []) ids.add((row as { id: string }).id);
    if ((data ?? []).length < pageSize) break;
  }
  return ids;
}

let created = 0;
let existing = 0;
let failed = 0;
let backfilled = 0;

/**
 * Writes the profile row, inserting it when absent.
 *
 * An UPDATE is not enough: on a database where the trigger never fired, the
 * row does not exist, so an UPDATE matches nothing and silently leaves the
 * account unusable. Upsert makes this both idempotent and self-healing.
 */
async function ensureProfile(
  account: Account,
  authId: string,
  hadProfile: boolean,
): Promise<boolean> {
  const { error } = await db.from("profiles").upsert(
    {
      id: authId,
      email: account.email,
      full_name: account.name,
      role: account.role,
      branch_id: account.branchId,
      job_title: account.jobTitle,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error(`  ✗ profile   ${account.email.padEnd(32)} ${error.message}`);
    return false;
  }

  if (!hadProfile) {
    backfilled++;
    console.log(
      `  + profile   ${account.email.padEnd(32)} ${account.role}  (row was missing — inserted)`,
    );
  }
  return true;
}

const authIds = await loadAuthUserIds();
const profileIds = await loadExistingProfileIds();

if (profileIds.size < authIds.size) {
  console.log(
    `\n  ${authIds.size - profileIds.size} of ${authIds.size} auth users have no ` +
      `profiles row — repairing.\n`,
  );
}

for (const account of accounts) {
  const { data, error } = await db.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: account.name,
      role: account.role,
      branch_id: account.branchId,
      job_title: account.jobTitle,
    },
  });

  if (!error) {
    created++;
    console.log(`  ✓ created   ${account.email.padEnd(32)} ${account.role}`);
    // The trigger has already inserted the row; this only confirms it, and
    // covers the case where the trigger is missing or was added later.
    if (!(await ensureProfile(account, data.user.id, profileIds.has(data.user.id)))) {
      failed++;
    }
    continue;
  }

  // A repeat run is the common case, not an error.
  if (/already been registered|already exists/i.test(error.message)) {
    existing++;
    const authId = authIds.get(account.email.toLowerCase());

    if (!authId) {
      failed++;
      console.error(
        `  ✗ orphan    ${account.email.padEnd(32)} auth user exists but could not be resolved`,
      );
      continue;
    }

    console.log(`  · exists    ${account.email.padEnd(32)} ${account.role}`);
    if (!(await ensureProfile(account, authId, profileIds.has(authId)))) failed++;
    continue;
  }

  failed++;
  console.error(`  ✗ failed    ${account.email.padEnd(32)} ${error.message}`);
}

console.log("");
console.log(
  `  created ${created} · already present ${existing} · back-filled ${backfilled} · failed ${failed}`,
);
console.log("");
console.log("  Sign in with any of these (password shown once here):");
for (const demo of DEMO_ACCOUNTS) {
  console.log(`    ${demo.role.padEnd(10)} ${demo.email.padEnd(32)} ${password}`);
}
console.log("");

if (failed > 0) process.exit(1);
