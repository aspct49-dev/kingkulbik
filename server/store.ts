/*
 * The content store: challenges, item store, originals rules, the live bet
 * feed, stream events (hunts, guesses, tournaments, giveaway) and uploaded
 * images. JSON files under ./data (or DATA_DIR), written
 * atomically (temp file, then rename), one write at a time per file.
 *
 * This is the stand-in until the database: it works on one machine (local
 * dev, a VPS). On Vercel there is no writable disk, so reads fall back to the
 * defaults and writes answer 503 with a clear message. Swapping in the
 * database means reimplementing read/write here; nothing else changes.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_CHALLENGES, DEFAULT_STORE_ITEMS } from '../shared/content.js'
import type { Challenge, StoreItem } from '../shared/content.js'
import { DEFAULT_RULES, sanitizeRules } from '../shared/originals.js'
import type { FeedBet, OriginalsRules } from '../shared/originals.js'
import type { Giveaway, GuessRound, Hunt, RaffleWin, Tournament } from '../shared/events.js'
import type { PlayerBet, PlayerProfile, Redemption } from '../shared/profiles.js'
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
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message)
  }
}

const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), 'data')
export const uploadsDir = () => path.join(dataDir(), 'uploads')

const cache = new Map<keyof Tables, unknown>()
const queues = new Map<string, Promise<unknown>>()

export async function read<K extends keyof Tables>(table: K): Promise<Tables[K]> {
  if (cache.has(table)) return cache.get(table) as Tables[K]
  let value: Tables[K]
  try {
    value = JSON.parse(await readFile(path.join(dataDir(), `${table}.json`), 'utf8')) as Tables[K]
  } catch {
    value = structuredClone(DEFAULTS[table])
  }
  if (table === 'rules') value = sanitizeRules(value as OriginalsRules) as Tables[K]
  cache.set(table, value)
  return value
}

async function persist<K extends keyof Tables>(table: K, value: Tables[K]) {
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

/** Run one change at a time per table, so concurrent edits can't overwrite each other */
function queued<T>(table: keyof Tables, run: () => Promise<T>): Promise<T> {
  const prev = queues.get(table) ?? Promise.resolve()
  const next = prev.then(run, run)
  queues.set(table, next.catch(() => undefined))
  return next
}

/** Replace a table */
export function write<K extends keyof Tables>(table: K, value: Tables[K]): Promise<void> {
  return queued(table, () => persist(table, value))
}

/** Read-modify-write as one queued step (`fn` may throw to cancel) */
export function update<K extends keyof Tables>(table: K, fn: (current: Tables[K]) => Tables[K]): Promise<Tables[K]> {
  return queued(table, async () => {
    const next = fn(structuredClone(await read(table)))
    await persist(table, next)
    return next
  })
}

/** Save an uploaded image; returns its public path */
export async function saveUpload(bytes: Buffer, ext: 'webp' | 'png' | 'jpg' | 'gif'): Promise<string> {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  try {
    await mkdir(uploadsDir(), { recursive: true })
    await writeFile(path.join(uploadsDir(), name), bytes)
  } catch (err) {
    console.error('[store] upload failed:', err)
    throw new StoreError('Uploads need a writable server or the database (works locally for now).')
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
