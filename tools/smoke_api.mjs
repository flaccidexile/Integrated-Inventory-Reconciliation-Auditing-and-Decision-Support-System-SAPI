#!/usr/bin/env node
/**
 * End-to-end smoke test of the live API.
 *
 *   node tools/smoke_api.mjs            # against http://localhost:4000
 *   API=http://localhost:4001 node tools/smoke_api.mjs
 *
 * Signs in as each of the three roles and calls every read endpoint, then
 * checks that the mutations are refused for the roles that must not have them.
 * Anything that is not the expected status is printed with the response body,
 * so a failure here is always actionable rather than "something went wrong".
 *
 * Read endpoints are expected to return 200 for every role: stock is readable
 * across branches by design (a Dipolog sales officer needs to know whether Cebu
 * can cover a customer), and the per-role difference lives in the payload and
 * in the mutation policies, not in the read status.
 */
import { readFileSync } from 'node:fs'

const API = process.env.API || 'http://localhost:4000'
const URL = 'https://szlqwcmmwveunelktlqm.supabase.co'
const ANON = /VITE_SUPABASE_ANON_KEY=(.+)/.exec(readFileSync('.env', 'utf8'))[1].trim()
const PASSWORD = process.env.SEED_PASSWORD || 'Southwind#2026'

const ROLES = ['manager', 'warehouse', 'sales']

let failures = 0
const ok = (m) => console.log(`  \x1b[32m+\x1b[0m ${m}`)
const bad = (m) => {
  console.log(`  \x1b[31mx\x1b[0m ${m}`)
  failures++
}
const note = (m) => console.log(`      ${m}`)

async function signIn(who) {
  const email = `${who}@southwind.com.ph`
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`${who}: ${JSON.stringify(body).slice(0, 200)}`)
  return body.access_token
}

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* not json */
  }
  return { status: res.status, json, text }
}

/** A short description of a payload, so the log shows shape and not just status. */
function describe(json) {
  if (json === null) return '(non-JSON body)'
  if (Array.isArray(json)) return `array[${json.length}]`
  if (typeof json !== 'object') return JSON.stringify(json)
  const parts = []
  for (const [k, v] of Object.entries(json)) {
    if (Array.isArray(v)) parts.push(`${k}[${v.length}]`)
    else if (v && typeof v === 'object') parts.push(`${k}{${Object.keys(v).length}}`)
    else parts.push(`${k}=${JSON.stringify(v)}`)
  }
  return parts.join(' ')
}

const tokens = {}
for (const who of ROLES) tokens[who] = await signIn(who)

// A real SKU, so /stock/:sku is tested against actual data rather than a 404.
const boot = await call('GET', '/api/bootstrap', tokens.manager)
const sku = boot.json?.parts?.[0]?.sku
const openTicket = (boot.json?.discrepancies ?? []).find((d) =>
  ['Locked', 'Under Review'].includes(d.status),
)

console.log(`\n  SAPI API smoke test — ${API}`)
console.log('  ' + '─'.repeat(58))

/* ── Reads ──────────────────────────────────────────────────────────────── */

const READS = [
  ['/api/me', 200],
  ['/api/bootstrap', 200],
  ['/api/branches', 200],
  ['/api/parts', 200],
  ['/api/suppliers', 200],
  ['/api/company', 200],
  ['/api/stock', 200],
  [`/api/stock/${sku}`, 200],
  ['/api/cycle-tasks', 200],
  ['/api/discrepancies', 200],
  ['/api/analytics/dashboard', 200],
  ['/api/analytics/discrepancies', 200],
  ['/api/analytics/cycle-summary', 200],
  ['/api/analytics/overview', 200],
  ['/api/matchmaker', 200],
  ['/api/transfers', 200],
  ['/api/purchase-orders', 200],
]

for (const who of ROLES) {
  console.log(`\n  Reads as ${who}`)
  for (const [path, want] of READS) {
    const r = await call('GET', path, tokens[who])
    if (r.status === want) {
      ok(`${path.padEnd(32)} ${r.status}  ${describe(r.json).slice(0, 76)}`)
    } else {
      bad(`${path.padEnd(32)} ${r.status} (expected ${want})  ${r.text.slice(0, 150)}`)
    }
  }
}

/* ── Auth boundary ──────────────────────────────────────────────────────── */

console.log('\n  Auth boundary')
for (const path of ['/api/me', '/api/bootstrap', '/api/stock']) {
  const r = await call('GET', path, null)
  if (r.status === 401) ok(`${path.padEnd(32)} 401 unauthenticated`)
  else bad(`${path.padEnd(32)} ${r.status} (expected 401 unauthenticated)`)
}
{
  const r = await call('GET', '/api/health', null)
  if (r.status === 200) ok('/api/health'.padEnd(32) + ' 200 unauthenticated')
  else bad(`/api/health                      ${r.status} (expected 200)`)
}
{
  const r = await call('GET', '/api/me', 'not-a-real-token')
  if (r.status === 401) ok('/api/me'.padEnd(32) + ' 401 invalid token')
  else bad(`/api/me                          ${r.status} (expected 401 for a bad token)`)
}

/* ── Mutations that must be refused ─────────────────────────────────────── */

// Authorization lives in RLS, but the API should surface a clean 403 rather
// than a raw Postgres error, so the status is part of the contract.
console.log('\n  Mutations that must be refused')

if (openTicket) {
  const r = await call('POST', `/api/discrepancies/${openTicket.id}/review`, tokens.warehouse, {
    decision: 'Approved',
    rootCause: 'Miscount',
    notes: 'smoke test — must be refused',
  })
  if (r.status === 403) ok(`warehouse reviewing a ticket      403`)
  else bad(`warehouse reviewing a ticket      ${r.status} (expected 403)  ${r.text.slice(0, 150)}`)

  const r2 = await call('POST', `/api/discrepancies/${openTicket.id}/review`, tokens.sales, {
    decision: 'Approved',
    rootCause: 'Miscount',
    notes: 'smoke test — must be refused',
  })
  if (r2.status === 403) ok(`sales reviewing a ticket          403`)
  else bad(`sales reviewing a ticket          ${r2.status} (expected 403)  ${r2.text.slice(0, 150)}`)
} else {
  note('no open discrepancy ticket found — skipped the review-refusal checks')
}

{
  const r = await call('POST', '/api/cycle-tasks/generate', tokens.sales, {})
  if (r.status === 403) ok(`sales generating a cycle queue    403`)
  else bad(`sales generating a cycle queue    ${r.status} (expected 403)  ${r.text.slice(0, 150)}`)
}

/* ── Unknown route ──────────────────────────────────────────────────────── */

console.log('\n  Error handling')
{
  const r = await call('GET', '/api/definitely-not-a-route', tokens.manager)
  if (r.status === 404) ok('/api/definitely-not-a-route      404')
  else bad(`/api/definitely-not-a-route      ${r.status} (expected 404)`)
}
{
  const r = await call('GET', '/api/stock/NO-SUCH-SKU-999', tokens.manager)
  if (r.status === 404) ok('/api/stock/NO-SUCH-SKU-999       404')
  else bad(`/api/stock/NO-SUCH-SKU-999       ${r.status} (expected 404)`)
}

console.log('')
console.log('  ' + '─'.repeat(58))
console.log(failures === 0 ? '  \x1b[32mAll endpoint checks passed.\x1b[0m' : `  \x1b[31m${failures} check(s) failed.\x1b[0m`)
console.log('')
process.exit(failures === 0 ? 0 : 1)
