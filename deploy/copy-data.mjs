// One-off: copy the site's data from another database (e.g. Neon) into the
// database in DATABASE_URL (the VPS's own), and bring uploaded images that live
// on Vercel Blob onto this server. Run on the VPS from the app folder:
//
//   cd /opt/kingkulbik
//   sudo -u kingkulbik node --env-file=.env deploy/copy-data.mjs 'postgresql://…neon.tech/…'
//
// Add --replace to overwrite tables the VPS database already has.
// Nothing is changed in the source database.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'
import pg from 'pg'

const source = process.argv[2]
const replace = process.argv.includes('--replace')
const target = process.env.DATABASE_URL
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')

if (!source || source.startsWith('--')) {
  console.error("Usage: node --env-file=.env deploy/copy-data.mjs '<source database URL>' [--replace]")
  process.exit(1)
}
if (!target) {
  console.error('DATABASE_URL is not set: run deploy/postgres.sh first, then use --env-file=.env.')
  process.exit(1)
}
if (source === target) {
  console.error('The source and the target are the same database.')
  process.exit(1)
}

const connect = (url) => {
  if (new URL(url).hostname.endsWith('.neon.tech')) {
    const sql = neon(url)
    return { query: (text, params = []) => sql.query(text, params), end: async () => {} }
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 })
  return { query: async (text, params = []) => (await pool.query(text, params)).rows, end: () => pool.end() }
}

const from = connect(source)
const to = connect(target)

await to.query(`CREATE TABLE IF NOT EXISTS kk_store (
  name text PRIMARY KEY,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
)`)

const rows = await from.query('SELECT name, value FROM kk_store ORDER BY name')
const existing = new Set((await to.query('SELECT name FROM kk_store')).map((r) => r.name))
console.log(`Source has ${rows.length} tables; the VPS database already has ${existing.size}.`)

// Uploaded images on Vercel Blob → files on this server, served at /api/uploads/<name>
const BLOB = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/uploads\/([a-z0-9-]+\.(?:webp|png|jpg|gif))$/
const downloaded = new Map()
async function localise(value) {
  if (typeof value === 'string') {
    const m = value.match(BLOB)
    if (!m) return value
    const name = m[1]
    if (!downloaded.has(name)) {
      const res = await fetch(value)
      if (!res.ok) {
        console.warn(`  ! could not download ${value} (${res.status}); keeping the old link`)
        downloaded.set(name, null)
      } else {
        await mkdir(path.join(dataDir, 'uploads'), { recursive: true })
        await writeFile(path.join(dataDir, 'uploads', name), Buffer.from(await res.arrayBuffer()))
        downloaded.set(name, `/api/uploads/${name}`)
      }
    }
    return downloaded.get(name) ?? value
  }
  if (Array.isArray(value)) return Promise.all(value.map(localise))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = await localise(v)
    return out
  }
  return value
}

let copied = 0
let skipped = 0
for (const row of rows) {
  if (existing.has(row.name) && !replace) {
    console.log(`  - ${row.name}: already on the VPS, skipped (use --replace to overwrite)`)
    skipped++
    continue
  }
  const value = await localise(row.value)
  await to.query(
    `INSERT INTO kk_store (name, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, version = kk_store.version + 1, updated_at = now()`,
    [row.name, JSON.stringify(value)],
  )
  console.log(`  + ${row.name}`)
  copied++
}

const images = [...downloaded.values()].filter(Boolean).length
console.log(`\nDone: ${copied} tables copied, ${skipped} skipped, ${images} images saved to ${path.join(dataDir, 'uploads')}.`)
console.log('Restart the site to use the copied data:  systemctl restart kingkulbik')
await from.end()
await to.end()
