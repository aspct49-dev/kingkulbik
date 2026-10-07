/*
 * The content store: challenges, item store, originals rules, the live bet
 * feed, stream events (hunts, guesses, tournaments, giveaway) and uploaded
 * images.
 *
 * With DATABASE_URL each table is one jsonb row in kk_store, read fresh on
 * every call (Vercel runs many instances, so nothing is cached). Writes are
 * optimistic: a row carries a version, and update() retries if another
 * instance saved in between. A Neon address (*.neon.tech) is reached over
 * HTTPS, which also works where port 5432 is blocked; any other address is a
 * regular PostgreSQL server (the VPS's own, deploy/postgres.sh).
 *
 * With BLOB_READ_WRITE_TOKEN, uploads go to the public Vercel Blob store and
 * are referenced by their Blob URL.
 *
 * Without either, everything falls back to JSON files under ./data (or
 * DATA_DIR), written atomically (temp file, then rename): fine on one machine,
 * but Vercel has no writable disk, so there writes answer 503.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'
import pg from 'pg'
import { put } from '@vercel/blob'
import { DEFAULT_CHALLENGES, DEFAULT_STORE_ITEMS } from '../shared/content.js'
import type { Challenge, StoreItem } from '../shared/content.js'
import { DEFAULT_RULES, sanitizeRules } from '../shared/originals.js'
import type { FeedBet, OriginalsRules, OwedPayout, PfState } from '../shared/originals.js'
import type { Giveaway, GuessRound, Hunt, RaffleWin, Tournament } from '../shared/events.js'
import { DEFAULT_SHOP_SETTINGS } from '../shared/profiles.js'
import type { PlayerBet, PlayerProfile, PointsLogEntry, Redemption, ShopSettings } from '../shared/profiles.js'
import type { Raffle } from '../shared/raffles.js'

type Tables = {
  challenges: Challenge[]
  shop: StoreItem[]
  rules: OriginalsRules
  feed: FeedBet[]
  hunts: Hunt[]
  guesses: GuessRound[]
  tournaments: Tournament[]
  giveaway: Giveaway | null
  raffleWins: RaffleWin[]
  players: PlayerProfile[]
  bets: PlayerBet[]
  redemptions: Redemption[]
  raffles: Raffle[]
  /** Watch-time raffle: each viewer's all-time BotRix minutes when a month was first counted */
  watchBaselines: { month: string; takenAt: number; minutes: Record<string, number> }[]
  /** Every BotRix points change made from the site (newest first) */
  pointsLog: PointsLogEntry[]
  shopSettings: ShopSettings
  /** Originals: each player's seeds, bet counter and Coinflip game, by Discord id */
  pfStates: Record<string, PfState>
  /** Originals wins BotRix couldn't pay yet */
  owedPayouts: OwedPayout[]
  /** Stake links an admin removed: Discord id → when (seconds); older links in cookies stop counting */
  stakeUnlinks: Record<string, number>
}

const DEFAULTS: Tables = {
  challenges: DEFAULT_CHALLENGES,
  shop: DEFAULT_STORE_ITEMS,
  rules: DEFAULT_RULES,
  feed: [],
  hunts: [],
  guesses: [],
  tournaments: [],
  giveaway: null,
  raffleWins: [],
  players: [],
  bets: [],
  redemptions: [],
  raffles: [],
  watchBaselines: [],
  pointsLog: [],
  shopSettings: DEFAULT_SHOP_SETTINGS,
  pfStates: {},
  owedPayouts: [],
  stakeUnlinks: {},
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message)
  }
}

const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), 'data')
export const uploadsDir = () => path.join(dataDir(), 'uploads')

// ---------------------------------------------------------------- database

/** What the store needs from a database: run a statement, get its rows */
type Sql = { query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }
let client: Sql | null | undefined
let schema: Promise<unknown> | null = null

const isNeon = (url: string) => {
  try {
    return new URL(url).hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

/** The database (Neon over HTTPS, or a regular PostgreSQL server), or null when DATABASE_URL isn't set (file mode) */
function db(): Sql | null {
  if (client !== undefined) return client
  const url = process.env.DATABASE_URL
  if (!url) return (client = null)
  if (isNeon(url)) {
    const sql = neon(url)
    client = { query: async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[] }
  } else {
    const pool = new pg.Pool({ connectionString: url, max: 10 })
    pool.on('error', (err) => console.error('[store] database connection error:', err.message))
    client = { query: async (text, params = []) => (await pool.query(text, params)).rows as Record<string, unknown>[] }
  }
  return client
}

/** Which store is in use, for the startup log */
export const storeKind = () => {
  const url = process.env.DATABASE_URL
  return !url ? `files in ${dataDir()}` : isNeon(url) ? 'Neon Postgres' : 'PostgreSQL'
}

async function query(sql: Sql, text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  schema ??= sql
    .query(
      `CREATE TABLE IF NOT EXISTS kk_store (
        name text PRIMARY KEY,
        value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    )
    .catch((err: unknown) => {
      schema = null
      throw err
    })
  try {
    await schema
    return await sql.query(text, params)
  } catch (err) {
    console.error('[store] database error:', err)
    throw new StoreError('Could not reach the database. Please try again.')
  }
}

const tidy = <K extends keyof Tables>(table: K, value: Tables[K]) =>
  (table === 'rules' ? sanitizeRules(value as OriginalsRules) : value) as Tables[K]

/** A table and its row version (0 = no row yet, so the defaults) */
async function load<K extends keyof Tables>(table: K): Promise<{ value: Tables[K]; version: number }> {
  const sql = db()
  if (!sql) return { value: structuredClone(await readFileTable(table)), version: 0 }
  const [row] = await query(sql, 'SELECT value, version FROM kk_store WHERE name = $1', [table])
  const value = row ? (row.value as Tables[K]) : structuredClone(DEFAULTS[table])
  return { value: tidy(table, value), version: row ? Number(row.version) : 0 }
}

/**
 * Save a table. With a version, only if the row is still at it (0: only if
 * there is no row yet); false means another instance saved first. Without
 * one, overwrite.
 */
async function save<K extends keyof Tables>(table: K, value: Tables[K], version?: number): Promise<boolean> {
  const sql = db()
  if (!sql) {
    await persistFile(table, value)
    return true
  }
  const json = JSON.stringify(value)
  const rows =
    version === undefined
      ? await query(
          sql,
          `INSERT INTO kk_store (name, value) VALUES ($1, $2::jsonb)
           ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, version = kk_store.version + 1, updated_at = now()
           RETURNING name`,
          [table, json],
        )
      : version === 0
        ? await query(
            sql,
            'INSERT INTO kk_store (name, value) VALUES ($1, $2::jsonb) ON CONFLICT (name) DO NOTHING RETURNING name',
            [table, json],
          )
        : await query(
            sql,
            `UPDATE kk_store SET value = $2::jsonb, version = version + 1, updated_at = now()
             WHERE name = $1 AND version = $3 RETURNING name`,
            [table, json, version],
          )
  return rows.length > 0
}

// ---------------------------------------------------------------- files (no database)

const cache = new Map<keyof Tables, unknown>()
const queues = new Map<string, Promise<unknown>>()

async function readFileTable<K extends keyof Tables>(table: K): Promise<Tables[K]> {
  if (cache.has(table)) return cache.get(table) as Tables[K]
  let value: Tables[K]
  try {
    value = JSON.parse(await readFile(path.join(dataDir(), `${table}.json`), 'utf8')) as Tables[K]
  } catch {
    value = structuredClone(DEFAULTS[table])
  }
  value = tidy(table, value)
  cache.set(table, value)
  return value
}

async function persistFile<K extends keyof Tables>(table: K, value: Tables[K]) {
  const dir = dataDir()
  const file = path.join(dir, `${table}.json`)
  try {
    await mkdir(dir, { recursive: true })
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, JSON.stringify(value, null, table === 'feed' || table === 'bets' ? 0 : 2))
    await rename(temp, file)
  } catch (err) {
    console.error('[store] write failed:', err)
    throw new StoreError('Saving needs a writable server or the database (works locally for now).')
  }
  cache.set(table, value)
}

// ---------------------------------------------------------------- tables

export async function read<K extends keyof Tables>(table: K): Promise<Tables[K]> {
  return (await load(table)).value
}

/** One change at a time per table in this instance; the row version guards across instances */
function queued<T>(table: keyof Tables, run: () => Promise<T>): Promise<T> {
  const prev = queues.get(table) ?? Promise.resolve()
  const next = prev.then(run, run)
  queues.set(table, next.catch(() => undefined))
  return next
}

/** Replace a table */
export function write<K extends keyof Tables>(table: K, value: Tables[K]): Promise<void> {
  return queued(table, async () => {
    await save(table, value)
  })
}

/** Read-modify-write as one step (`fn` may throw to cancel); retried if another instance saved first */
export function update<K extends keyof Tables>(table: K, fn: (current: Tables[K]) => Tables[K]): Promise<Tables[K]> {
  return queued(table, async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      // A short random pause after a clash, so racing instances fall out of step
      if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 60 * attempt))
      const { value, version } = await load(table)
      const next = fn(value)
      if (await save(table, next, version)) return next
    }
    throw new StoreError('Too many changes at once. Please try again.')
  })
}

// ---------------------------------------------------------------- uploads

const IMAGE_TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' } as const

/** The Blob store's public host, from its token (vercel_blob_rw_<storeId>_<secret>) */
function blobHost(): string | null {
  const id = process.env.BLOB_READ_WRITE_TOKEN?.split('_')[3]
  return id ? `${id.toLowerCase()}.public.blob.vercel-storage.com` : null
}

/** An uploaded image's URL: on this server (file mode) or in our Blob store */
export function isUploadUrl(s: string): boolean {
  if (/^\/api\/uploads\/[a-z0-9-]+\.(webp|png|jpg|gif)$/.test(s)) return true
  const prefix = `https://${blobHost()}/uploads/`
  return blobHost() !== null && s.startsWith(prefix) && /^[a-z0-9-]+\.(webp|png|jpg|gif)$/.test(s.slice(prefix.length))
}

/** Save an uploaded image; returns its public URL */
export async function saveUpload(bytes: Buffer, ext: 'webp' | 'png' | 'jpg' | 'gif'): Promise<string> {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    try {
      const blob = await put(`uploads/${name}`, bytes, {
        access: 'public',
        addRandomSuffix: false,
        contentType: IMAGE_TYPES[ext],
        // Names are unique, so a file never changes
        cacheControlMaxAge: 31_536_000,
        token,
      })
      return blob.url
    } catch (err) {
      console.error('[store] Blob upload failed:', err)
      throw new StoreError('Could not save the image. Please try again.')
    }
  }
  try {
    await mkdir(uploadsDir(), { recursive: true })
    await writeFile(path.join(uploadsDir(), name), bytes)
  } catch (err) {
    console.error('[store] upload failed:', err)
    throw new StoreError('Uploads need a writable server or Blob storage (works locally for now).')
  }
  return `/api/uploads/${name}`
}

export async function readUpload(name: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+\.(webp|png|jpg|gif)$/.test(name)) return null
  try {
    return await readFile(path.join(uploadsDir(), name))
  } catch {
    return null
  }
}
