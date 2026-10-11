#!/usr/bin/env node
/**
 * Apply `supabase/setup-all.sql` to the live Supabase project, then verify it.
 *
 * Two ways in, because Supabase exposes two different credentials and only one
 * of them may be available:
 *
 *   1. Database password  -> connect straight to Postgres through the pooler.
 *      SUPABASE_DB_PASSWORD=... node tools/apply_schema.mjs
 *
 *   2. Personal access token (sbp_...) -> POST the SQL to the Management API,
 *      which runs it server-side. No database password needed.
 *      SUPABASE_ACCESS_TOKEN=sbp_... node tools/apply_schema.mjs --token
 *
 * The direct host `db.<ref>.supabase.co` is deliberately not used: on current
 * Supabase projects it is IPv6-only, and many networks (including the one this
 * was written on) have no IPv6 route. The pooler is IPv4 and always reachable.
 *
 * Add --check to verify without applying.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SQL_FILE = path.join(ROOT, 'supabase', 'setup-all.sql')
const TARGET_FILE = path.join(HERE, '.db-target.json')

const PROJECT_REF = 'szlqwcmmwveunelktlqm'
const API_BASE = 'https://api.supabase.com'

const argv = process.argv.slice(2)
const USE_TOKEN = argv.includes('--token')
const CHECK_ONLY = argv.includes('--check')

const log = (s = '') => process.stdout.write(s + '\n')
const ok = (s) => log(`  \x1b[32m+\x1b[0m ${s}`)
const bad = (s) => log(`  \x1b[31mx\x1b[0m ${s}`)

/* ------------------------------------------------------------------ */
/* Path 1 — direct Postgres through the pooler                        */
/* ------------------------------------------------------------------ */

function loadPg() {
  const roots = [
    createRequire(import.meta.url),
    createRequire(
      'C:/Users/molino/.workbuddy-ai/binaries/node/workspace/package.json',
    ),
  ]
  for (const r of roots) {
    try {
      return r('pg')
    } catch {
      /* next root */
    }
  }
  throw new Error(
    'The `pg` client is not installed. Run:  npm install --save-dev pg',
  )
}

function resolveTarget() {
  if (fs.existsSync(TARGET_FILE)) {
    const t = JSON.parse(fs.readFileSync(TARGET_FILE, 'utf8'))
    if (t && t.host) return t
  }
  // Confirmed by tools/db_probe.mjs: the tenant lives on aws-0-ap-southeast-1.
  return {
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${PROJECT_REF}`,
    database: 'postgres',
  }
}

async function connectDirect() {
  const pg = loadPg()
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!password) {
    throw new Error(
      'SUPABASE_DB_PASSWORD is not set. Set it, or pass --token to use a personal access token instead.',
    )
  }
  const target = resolveTarget()
  const ports = [target.port, target.port === 5432 ? 6543 : 5432]

  let lastErr
  for (const port of ports) {
    const client = new pg.Client({
      host: target.host,
      port,
      user: target.user,
      password,
      database: target.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12_000,
    })
    try {
      await client.connect()
      const { rows } = await client.query('select current_user as u')
      ok(`connected to ${target.host}:${port} as ${rows[0].u}`)
      return client
    } catch (err) {
      lastErr = err
      try {
        await client.end()
      } catch {
        /* already gone */
      }
    }
  }
  throw lastErr
}

/* ------------------------------------------------------------------ */
/* Path 2 — Management API with a personal access token               */
/* ------------------------------------------------------------------ */

async function runViaToken(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens',
    )
  }
  const res = await fetch(
    `${API_BASE}/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql, read_only: false }),
    },
  )
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${text.slice(0, 600)}`)
  }
  ok('SQL accepted by the Management API')
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Verification                                                       */
/* ------------------------------------------------------------------ */

const TABLES = [
  'branches',
  'parts',
  'suppliers',
  'company_settings',
  'profiles',
  'stock_records',
  'cycle_tasks',
  'discrepancies',
  'transfers',
  'purchase_orders',
  'match_suggestion_dismissals',
]

const VIEWS = [
  'v_stock_enriched',
  'v_branch_summary',
  'v_category_summary',
  'v_discrepancy_enriched',
]

const RPCS = [
  'rpc_dashboard_kpis',
  'rpc_discrepancy_analytics',
  'rpc_cycle_summary',
]

/** Tables that are legitimately empty on a freshly seeded database.
 *  `profiles` stays empty until provisioning creates the login accounts, and
 *  the dismissal ledger stays empty until someone dismisses a suggestion. */
const MAY_BE_EMPTY = new Set(['profiles', 'match_suggestion_dismissals'])

/** Verify by reconnecting read-only-ish: same client, plain SELECTs. */
async function verifyWithClient(client) {
  let failures = 0
  const fail = (m) => {
    bad(m)
    failures++
  }

  log('\n  Tables')
  for (const t of TABLES) {
    try {
      const { rows } = await client.query(`select count(*)::int as n from public.${t}`)
      const n = rows[0].n
      if (n === 0 && !MAY_BE_EMPTY.has(t)) {
        fail(`${t.padEnd(28)} 0 rows`)
      } else {
        const note = n === 0 ? '  (expected empty here)' : ''
        ok(`${t.padEnd(28)} ${n} rows${note}`)
      }
    } catch (err) {
      fail(`${t.padEnd(28)} ${err.message}`)
    }
  }

  log('\n  Views (must return rows without error)')
  for (const v of VIEWS) {
    try {
      const { rows } = await client.query(`select count(*)::int as n from public.${v}`)
      ok(`${v.padEnd(28)} ${rows[0].n} rows`)
    } catch (err) {
      fail(`${v.padEnd(28)} ${err.message}`)
    }
  }

  log('\n  RPCs')
  try {
    // `to_jsonb` is required: rpc_dashboard_kpis returns a composite type, and
    // without the cast node-postgres hands back an opaque string like
    // "(232,8,...)" whose Object.keys() are just character indices.
    const { rows } = await client.query(
      'select to_jsonb(public.rpc_dashboard_kpis()) as k',
    )
    const k = rows[0].k ?? {}
    ok(`rpc_dashboard_kpis              ${Object.keys(k).length} keys`)
    const expected = {
      total_positions: 232,
      branch_count: 8,
      sku_count: 29,
      open_discrepancies: 4,
    }
    for (const [key, want] of Object.entries(expected)) {
      if (Number(k[key]) === want) ok(`    ${key.padEnd(26)} ${k[key]}`)
      else fail(`    ${key.padEnd(26)} ${k[key]} (expected ${want})`)
    }
    for (const key of ['count_accuracy', 'stock_health']) {
      if (Number(k[key]) > 0) ok(`    ${key.padEnd(26)} ${k[key]}`)
      else fail(`    ${key.padEnd(26)} missing or zero`)
    }
  } catch (err) {
    fail(`rpc_dashboard_kpis              ${err.message}`)
  }

  try {
    const { rows } = await client.query('select public.rpc_discrepancy_analytics() as a')
    const a = rows[0].a
    const months = a?.byMonth ?? []
    ok(`rpc_discrepancy_analytics       byMonth: ${months.length} months`)
    const sample = months[months.length - 1]
    if (sample) {
      const hasBacklog = 'backlog' in sample
      const leaked = 'sort_key' in sample
      log(
        `      last month = ${JSON.stringify({
          month: sample.month,
          opened: sample.opened,
          resolved: sample.resolved,
          backlog: sample.backlog,
        })}`,
      )
      if (!hasBacklog) fail('byMonth entries are missing `backlog`')
      if (leaked) fail('byMonth leaked internal `sort_key`')
    } else {
      fail('byMonth is empty')
    }
  } catch (err) {
    fail(`rpc_discrepancy_analytics       ${err.message}`)
  }

  try {
    const { rows } = await client.query(
      'select to_jsonb(public.rpc_cycle_summary()) as c',
    )
    const c = rows[0].c ?? {}
    ok(`rpc_cycle_summary               total_tasks ${c.total_tasks}`)
    const want = 64
    if (Number(c.total_tasks) !== want) fail(`    total_tasks ${c.total_tasks} (expected ${want})`)
  } catch (err) {
    fail(`rpc_cycle_summary               ${err.message}`)
  }

  log('\n  Row Level Security')
  try {
    const { rows } = await client.query(`
      select count(*)::int as total,
             count(*) filter (where relrowsecurity)::int as with_rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`)
    const { total, with_rls } = rows[0]
    if (total === with_rls) ok(`all ${total} tables have RLS enabled`)
    else fail(`${total - with_rls} of ${total} tables have RLS DISABLED`)
  } catch (err) {
    fail(`RLS check                       ${err.message}`)
  }

  try {
    const { rows } = await client.query(`
      select count(*)::int as n from pg_policies where schemaname = 'public'`)
    const n = rows[0].n
    if (n > 0) ok(`${n} RLS policies installed`)
    else fail('no RLS policies found')
  } catch (err) {
    fail(`policy count                    ${err.message}`)
  }

  return failures
}

/** Verify through PostgREST instead, when we came in via the Management API. */
async function verifyWithRest(anonKey) {
  let failures = 0
  const fail = (m) => {
    bad(m)
    failures++
  }
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }

  log('\n  Tables (via PostgREST, as anon — expect 0 rows, not an error)')
  for (const t of TABLES) {
    const res = await fetch(
      `https://${PROJECT_REF}.supabase.co/rest/v1/${t}?select=*&limit=1`,
      { headers },
    )
    if (res.ok) ok(`${t.padEnd(28)} reachable`)
    else {
      const body = await res.text()
      fail(`${t.padEnd(28)} ${res.status} ${body.slice(0, 90)}`)
    }
  }
  return failures
}

/* ------------------------------------------------------------------ */

async function main() {
  if (!fs.existsSync(SQL_FILE)) {
    console.error(`Missing ${SQL_FILE}`)
    process.exit(2)
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8')
  const lines = sql.split('\n').length

  log('\n  SAPI — apply supabase/setup-all.sql')
  log('  ' + '─'.repeat(52))
  log(`  file    ${path.relative(ROOT, SQL_FILE)}  (${lines} lines)`)

  let client = null
  let failures = 0

  try {
    if (USE_TOKEN) {
      log('  route   Management API (personal access token)')
      log('  ' + '─'.repeat(52))
      if (CHECK_ONLY) {
        log('\n  --check given: verifying only, not applying.\n')
        failures = await verifyWithRest(process.env.SUPABASE_ANON_KEY || '')
      } else {
        const result = await runViaToken(sql)
        if (Array.isArray(result) && result.length) {
          log('\n  Self-check returned by the server:')
          for (const row of result) log(`    ${JSON.stringify(row)}`)
        }
        log('')
        failures = await verifyWithRest(process.env.SUPABASE_ANON_KEY || '')
      }
    } else {
      log('  route   direct Postgres via connection pooler')
      log('  ' + '─'.repeat(52))
      client = await connectDirect()

      if (CHECK_ONLY) {
        log('\n  --check given: verifying only, not applying.\n')
        failures = await verifyWithClient(client)
      } else {
        log('\n  Applying… (one transaction; any failure rolls back everything)')
        const started = Date.now()
        const results = await client.query(sql)
        const secs = ((Date.now() - started) / 1000).toFixed(1)
        ok(`applied in ${secs}s`)

        // The file ends with its own count self-check; surface it.
        const last = Array.isArray(results) ? results[results.length - 1] : null
        if (last && last.rows && last.rows.length) {
          log('\n  Self-check reported by the database:')
          for (const row of last.rows) {
            const [name, count] = Object.values(row)
            log(`    ${String(name).padEnd(28)} ${count}`)
          }
        }
        failures = await verifyWithClient(client)
      }
    }
  } catch (err) {
    log('')
    bad(err.message)
    if (err.code === '28P01') {
      log('')
      log('  The host and tenant are correct — the pooler found the project and')
      log('  forwarded the login to Postgres, which then rejected the password.')
      log('  That means SUPABASE_DB_PASSWORD is not the database password.')
      log('')
      log('  Two ways forward:')
      log('    1. Dashboard -> Project Settings -> Database -> Reset database password,')
      log('       then re-run with the new one.')
      log('    2. Create a personal access token at')
      log('       https://supabase.com/dashboard/account/tokens and re-run with --token.')
      log('')
    }
    if (client) {
      try {
        await client.end()
      } catch {
        /* already gone */
      }
    }
    process.exit(1)
  }

  if (client) await client.end()

  log('')
  log('  ' + '─'.repeat(52))
  if (failures === 0) {
    log('  \x1b[32mAll checks passed.\x1b[0m')
  } else {
    log(`  \x1b[31m${failures} check(s) failed.\x1b[0m`)
  }
  log('')
  process.exit(failures === 0 ? 0 : 1)
}

main()
