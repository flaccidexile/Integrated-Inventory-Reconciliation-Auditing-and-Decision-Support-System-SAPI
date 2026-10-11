#!/usr/bin/env node
/**
 * Find a working connection to the Supabase Postgres instance.
 *
 * Why this exists: `db.<ref>.supabase.co` is IPv6-only on current Supabase
 * projects, and this machine has no IPv6 route (`ping -6` fails with "general
 * failure"). The connection pooler is dual-stack IPv4, so it is the only way in
 * from here. Which pooler node hosts the project depends on the region Supabase
 * placed it in, and that is not discoverable from the REST endpoint -- so we
 * probe the plausible candidates and report the first one that authenticates.
 *
 * The password is read from the environment and never written to disk.
 *
 *   SUPABASE_DB_PASSWORD=... node tools/db_probe.mjs
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `pg` is a dev-only tool dependency. Resolve it from the project first (so a
// fresh clone works after `npm install`), then fall back to the managed Node
// workspace, which is where it was originally installed.
const requireFrom = [
  createRequire(import.meta.url),
  createRequire(
    'C:/Users/molino/.workbuddy-ai/binaries/node/workspace/package.json',
  ),
]

let pg
for (const req of requireFrom) {
  try {
    pg = req('pg')
    break
  } catch {
    /* try the next root */
  }
}
if (!pg) {
  console.error(
    '\n  The `pg` client is not installed.\n' +
      '  Install it as a dev dependency of this project:\n\n' +
      '    npm install --save-dev pg\n',
  )
  process.exit(2)
}

const PROJECT_REF = 'szlqwcmmwveunelktlqm'
const PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!PASSWORD) {
  console.error('SUPABASE_DB_PASSWORD is not set.')
  process.exit(2)
}

// The direct host resolved to 2406:da18:... which is AWS ap-southeast-1, so try
// that region first. The rest are ordered by rough likelihood for a PH-based
// project. `aws-0` vs `aws-1` is an internal Supabase generation marker and we
// cannot tell which one holds this project, so both are tried.
const REGIONS = [
  'ap-southeast-1',
  'ap-northeast-1',
  'ap-southeast-2',
  'ap-south-1',
  'us-east-1',
  'us-west-1',
  'eu-central-1',
]

/** Session mode (5432) keeps one backend for the whole connection, which is
 *  what a multi-statement DDL script needs. Transaction mode (6543) is listed
 *  second for each host as a fallback. */
function candidates() {
  const out = []
  for (const region of REGIONS) {
    for (const gen of ['aws-1', 'aws-0']) {
      for (const port of [5432, 6543]) {
        out.push({
          label: `${gen}-${region}:${port}`,
          host: `${gen}-${region}.pooler.supabase.com`,
          port,
          user: `postgres.${PROJECT_REF}`,
        })
      }
    }
  }
  out.push({
    label: 'direct (IPv6 only -- expected to fail here)',
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
  })
  return out
}

async function tryConnect(spec) {
  const client = new pg.Client({
    host: spec.host,
    port: spec.port,
    user: spec.user,
    password: PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8_000,
    query_timeout: 10_000,
  })
  try {
    await client.connect()
    const { rows } = await client.query(
      `select current_database() as db,
              current_user      as usr,
              (select count(*) from information_schema.tables
                where table_schema = 'public') as public_tables,
              version() as version`,
    )
    return { ok: true, client, info: rows[0] }
  } catch (err) {
    try {
      await client.end()
    } catch {
      /* already dead */
    }
    return { ok: false, error: err }
  }
}

const results = []
for (const spec of candidates()) {
  const res = await tryConnect(spec)
  if (res.ok) {
    const v = res.info.version.match(/PostgreSQL ([\d.]+)/)
    console.log(`\n  CONNECTED via ${spec.label}`)
    console.log(`    host      ${spec.host}:${spec.port}`)
    console.log(`    user      ${res.info.usr}`)
    console.log(`    database  ${res.info.db}`)
    console.log(`    version   ${v ? 'PostgreSQL ' + v[1] : 'PostgreSQL'}`)
    console.log(`    public tables already present: ${res.info.public_tables}`)
    console.log(`\n  Connection string for tools/apply_schema.mjs:\n`)
    console.log(
      `    postgresql://${spec.user}:<password>@${spec.host}:${spec.port}/postgres\n`,
    )
    // Write the winner where the apply script can find it, minus the password.
    const fs = await import('node:fs')
    const here = path.dirname(fileURLToPath(import.meta.url))
    fs.writeFileSync(
      path.join(here, '.db-target.json'),
      JSON.stringify(
        { host: spec.host, port: spec.port, user: spec.user, database: 'postgres', label: spec.label },
        null,
        2,
      ) + '\n',
    )
    await res.client.end()
    process.exit(0)
  }
  results.push({ label: spec.label, message: res.error.message })
  console.log(`  ...${spec.label.padEnd(28)} ${res.error.message}`)
}

console.log('\n  No candidate accepted the connection.\n')
const byMessage = new Map()
for (const r of results) {
  if (!byMessage.has(r.message)) byMessage.set(r.message, [])
  byMessage.get(r.message).push(r.label)
}
for (const [message, labels] of byMessage) {
  console.log(`  ${message}`)
  console.log(`    ${labels.length} host(s), e.g. ${labels[0]}`)
}
console.log()
process.exit(1)
