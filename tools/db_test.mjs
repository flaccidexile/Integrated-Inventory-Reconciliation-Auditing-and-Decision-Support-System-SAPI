#!/usr/bin/env node
/**
 * Focused diagnostic: the probe narrowed the project down to the
 * aws-0-ap-southeast-1 pooler, but 5432 dropped the socket and 6543 rejected
 * the password. This script prints full error detail and tries a few plausible
 * password encodings so we can tell "wrong password" apart from "wrong host".
 */
import { createRequire } from 'node:module'

const roots = [
  createRequire(import.meta.url),
  createRequire(
    'C:/Users/molino/.workbuddy-ai/binaries/node/workspace/package.json',
  ),
]
let pg
for (const r of roots) {
  try {
    pg = r('pg')
    break
  } catch {}
}
if (!pg) {
  console.error('pg not installed')
  process.exit(2)
}

const REF = 'szlqwcmmwveunelktlqm'
const RAW = process.env.SUPABASE_DB_PASSWORD || ''

console.log(`\n  password supplied: ${RAW.length} chars\n`)

const variants = [
  ['as given', RAW],
  ['no trailing !', RAW.replace(/!$/, '')],
  ['with trailing newline', RAW + '\n'],
]

const targets = [
  ['session 5432', 'aws-0-ap-southeast-1.pooler.supabase.com', 5432, `postgres.${REF}`],
  ['txn     6543', 'aws-0-ap-southeast-1.pooler.supabase.com', 6543, `postgres.${REF}`],
]

for (const [tlabel, host, port, user] of targets) {
  for (const [vlabel, password] of variants) {
    const client = new pg.Client({
      host,
      port,
      user,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
      query_timeout: 10_000,
    })
    try {
      await client.connect()
      const r = await client.query('select current_user as u, current_database() as d')
      console.log(`  OK   ${tlabel}  [${vlabel}]  -> ${r.rows[0].u}@${r.rows[0].d}`)
      await client.end()
      process.exit(0)
    } catch (err) {
      const code = err.code ? ` code=${err.code}` : ''
      const sev = err.severity ? ` severity=${err.severity}` : ''
      console.log(`  FAIL ${tlabel}  [${vlabel}]  ${err.message}${code}${sev}`)
      try {
        await client.end()
      } catch {}
    }
  }
}
console.log()
