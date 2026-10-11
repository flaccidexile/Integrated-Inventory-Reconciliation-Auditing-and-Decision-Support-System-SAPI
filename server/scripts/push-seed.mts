/**
 * Pushes the seed dataset straight into Supabase using the service-role key.
 *
 *   npm run seed:push
 *
 * An alternative to pasting `supabase/seed.sql` into the SQL Editor — useful
 * when you are iterating and want one command. Both routes write the same rows
 * because both read `seed-rows.mts`.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { buildSeed } from "./seed-rows.mts";

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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

const tables = buildSeed();
let failed = false;

for (const table of tables) {
  const onConflict = table.conflict.replace(/[()]/g, "");

  const { error } = await db.from(table.table).upsert(table.rows, {
    onConflict,
    // Reference data is refreshed; transactional rows are left alone so a
    // clerk's in-progress work is never overwritten by a re-seed.
    ignoreDuplicates: !table.upsert,
  });

  if (error) {
    failed = true;
    console.error(`  ✗ ${table.table.padEnd(20)} ${error.message}`);
    continue;
  }
  console.log(`  ✓ ${table.table.padEnd(20)} ${table.rows.length} row(s)`);
}

if (failed) {
  console.error(
    "\n  Some tables failed. The usual cause is that the migrations have not " +
      "been run yet — apply 0001 to 0004 in the Supabase SQL Editor first.\n",
  );
  process.exit(1);
}

console.log("\n  Seed complete. Next: npm run provision\n");
