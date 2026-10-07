/*
 * Monthly raffles: wager (Stake) and watch time (BotRix).
 *
 * Tickets
 *   Wager: Stake's affiliate leaderboard for the raffle's dates (customRange),
 *   one ticket per `ticketUnit` dollars wagered under the code.
 *   Watch: BotRix only publishes all-time watch minutes (top 100, or one name
 *   by search) with no monthly table. So the first time a month is asked
 *   about, the server saves everyone's all-time minutes as that month's
 *   baseline; monthly watch time is the current total minus the baseline.
 *   It covers BotRix's top 100 plus everyone who linked Kick on the site;
 *   someone seen for the first time mid-month counts from then.
 *
 * Draws (see shared/raffles.ts): locking freezes the tickets and commits to
 * a secret seed (its hash is public); each draw is reproducible from the seed,
 * which is revealed when the raffle is complete. The seed never leaves the
 * server before that, not even to admins.
 *
 *   GET  /api/raffles                          the current raffle of each kind
 *   GET  /api/admin/raffles                    every raffle, live tickets with full names
 *   POST /api/admin/raffles                    { kind, title?, prizePool?, prizePerDraw?, maxWinsPerPerson?, ticketUnit?, start?, end? }
 *   POST /api/admin/raffles/<id>               settings (open raffles only)
 *   POST /api/admin/raffles/<id>/lock          freeze tickets, commit the seed
 *   POST /api/admin/raffles/<id>/unlock        back to open (before any draw)
 *   POST /api/admin/raffles/<id>/draw          the next draw
 *   POST /api/admin/raffles/<id>/delete
 *   POST /api/admin/raffles/baseline           retake this month's watch-time baseline
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  DEFAULT_RAFFLE,
  drawCount,
  drawNext,
  freezeEntries,
  maskName,
  monthWindow,
} from '../shared/raffles.js'
import type { PublicRaffle, Raffle, RaffleEntry, RaffleKind } from '../shared/raffles.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { BOTRIX_CHANNEL, getBotrixViewer } from './botrix.js'
import { parseLeaderboardCsv } from './stakeLeaderboard.js'
import { read, StoreError, update } from './store.js'

class InputError extends Error {}

const CACHE_MS = 60_000
const monthKey = (at: number) => new Date(at).toISOString().slice(0, 7)

// ---------------------------------------------------------------- wager (Stake)

const wagerCache = new Map<string, { at: number; rows: { name: string; amount: number }[] }>()

async function wagerTotals(start: number, end: number, env: AuthEnv) {
  const key = `${start}:${end}`
  const hit = wagerCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows
  if (!env.STAKE_API_TOKEN) throw new InputError('The Stake API token is not set (STAKE_API_TOKEN).')
  const url = new URL('/affiliate/leaderboard', env.STAKE_API_BASE || 'https://api.stake.com')
  url.search = new URLSearchParams({
    timePeriod: 'customRange',
    isStakeExclusive: 'false',
    limit: '1000',
    startDate: String(start),
    endDate: String(Math.min(end, Date.now()) - 1),
  }).toString()
  let res: Response
  try {
    res = await fetch(url, { headers: { 'x-access-token': env.STAKE_API_TOKEN, Accept: 'text/csv' }, signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new InputError('Could not reach Stake for the wager totals.')
  }
  if (!res.ok) throw new InputError(`Stake answered ${res.status} for the wager totals.`)
  const rows = parseLeaderboardCsv(await res.text())
    .filter((r) => r.name && r.wagered > 0)
    .map((r) => ({ name: r.name, amount: r.wagered }))
  wagerCache.set(key, { at: Date.now(), rows })
  return rows
}

// ---------------------------------------------------------------- watch time (BotRix)

type BotrixRow = { name: string; watchtime: number }
let topCache: { at: number; rows: BotrixRow[] } | null = null

/** BotRix's public top 100 by points (all-time watch minutes included) */
async function botrixTop(): Promise<BotrixRow[]> {
  if (topCache && Date.now() - topCache.at < CACHE_MS) return topCache.rows
  const url = `https://botrix.live/api/public/leaderboard?platform=kick&user=${BOTRIX_CHANNEL}`
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new InputError(`BotRix answered ${res.status}.`)
  const rows = ((await res.json()) as { name?: string; watchtime?: number }[])
    .filter((r) => r.name)
    .map((r) => ({ name: String(r.name), watchtime: Number(r.watchtime) || 0 }))
  topCache = { at: Date.now(), rows }
  return rows
}

/** All-time minutes for BotRix's top 100 plus every Kick account linked on the site */
async function watchNow(): Promise<Map<string, BotrixRow>> {
  const out = new Map<string, BotrixRow>()
  for (const r of await botrixTop()) out.set(r.name.toLowerCase(), r)
  const linked = (await read('players'))
    .map((p) => p.kick?.username)
    .filter((n): n is string => Boolean(n) && !out.has(n!.toLowerCase()))
  // Eight lookups at a time: quick with many linked viewers, gentle on BotRix
  for (let i = 0; i < linked.length; i += 8) {
    const found = await Promise.all(linked.slice(i, i + 8).map((name) => getBotrixViewer(name).catch(() => null)))
    for (const v of found) if (v) out.set(v.name.toLowerCase(), { name: v.name, watchtime: v.watchtime })
  }
  return out
}

/** This month's watch minutes per viewer (current all-time minus the month's baseline) */
async function watchTotals(at = Date.now(), reset = false) {
  const month = monthKey(at)
  const now = await watchNow()
  let baseline = (await read('watchBaselines')).find((b) => b.month === month)
  const missing = [...now.values()].filter((r) => !baseline || reset || !(r.name.toLowerCase() in baseline.minutes))
  if (!baseline || reset || missing.length) {
    // First sight this month (or a reset): today's total becomes the starting point
    const next = {
      month,
      takenAt: !baseline || reset ? Date.now() : baseline.takenAt,
      minutes: reset || !baseline ? {} : { ...baseline.minutes },
    } as { month: string; takenAt: number; minutes: Record<string, number> }
    for (const r of missing) next.minutes[r.name.toLowerCase()] = r.watchtime
    if (reset || !baseline) for (const r of now.values()) next.minutes[r.name.toLowerCase()] = r.watchtime
    await update('watchBaselines', (list) => [next, ...list.filter((b) => b.month !== month)].slice(0, 24)).catch(() => undefined)
    baseline = next
  }
  const rows = [...now.values()]
    .map((r) => ({ name: r.name, amount: Math.max(0, r.watchtime - (baseline!.minutes[r.name.toLowerCase()] ?? r.watchtime)) }))
    .filter((r) => r.amount > 0)
  return { rows, countingFrom: baseline.takenAt }
}

// ---------------------------------------------------------------- views

const liveCache = new Map<string, { at: number; entries: RaffleEntry[]; countingFrom: number | null }>()

type LiveEntries = { at: number; entries: RaffleEntry[]; countingFrom: number | null }
const recounting = new Map<string, Promise<LiveEntries>>()
/** Past the minute, a count this old is still shown at once while the next one runs */
const STALE_OK_MS = 30 * 60_000

async function countNow(r: Raffle, env: AuthEnv, key: string): Promise<LiveEntries> {
  const v: LiveEntries =
    r.kind === 'wager'
      ? { at: Date.now(), entries: freezeEntries(await wagerTotals(r.start, r.end, env), r.ticketUnit), countingFrom: null }
      : await watchTotals(r.start).then(({ rows, countingFrom }) => ({
          at: Date.now(),
          entries: freezeEntries(rows, r.ticketUnit),
          countingFrom,
        }))
  liveCache.set(key, v)
  return v
}

/**
 * Open raffles: tickets from the live source. Locked/complete: the frozen list.
 * Visitors get the last count at once while a recount runs behind it; `fresh`
 * (locking) always waits for a new count.
 */
async function entriesOf(r: Raffle, env: AuthEnv, fresh = false): Promise<{ entries: RaffleEntry[]; countingFrom: number | null }> {
  if (r.status !== 'open') return { entries: r.entries, countingFrom: null }
  const key = `${r.id}:${r.ticketUnit}:${r.start}:${r.end}`
  if (fresh) return countNow(r, env, key)
  const hit = liveCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit
  let pending = recounting.get(key)
  if (!pending) {
    pending = countNow(r, env, key).finally(() => recounting.delete(key))
    recounting.set(key, pending)
  }
  if (hit && Date.now() - hit.at < STALE_OK_MS) {
    pending.catch(() => undefined)
    return hit
  }
  return pending
}

function withOdds(entries: RaffleEntry[]) {
  const total = entries.reduce((s, e) => s + e.tickets, 0)
  return { total, list: entries.map((e) => ({ ...e, odds: total ? e.tickets / total : 0 })) }
}

/** Strip the seed until the raffle is finished */
const sealed = (r: Raffle) => ({ ...r, seed: r.status === 'complete' ? r.seed : null })

async function publicView(r: Raffle, env: AuthEnv, me: { stake?: string; kick?: string }): Promise<PublicRaffle> {
  let entries: RaffleEntry[] = []
  let countingFrom: number | null = null
  try {
    ;({ entries, countingFrom } = await entriesOf(r, env))
  } catch {
    entries = r.entries
  }
  const { total, list } = withOdds(entries)
  const mineName = (r.kind === 'wager' ? me.stake : me.kick)?.toLowerCase()
  const mine = mineName ? list.find((e) => e.name.toLowerCase() === mineName) : undefined
  return {
    ...sealed(r),
    entries: list.map((e) => ({ ...e, name: r.kind === 'wager' ? maskName(e.name) : e.name })),
    draws: r.draws.map((d) => ({ ...d, name: r.kind === 'wager' ? maskName(d.name) : d.name })),
    totalTickets: total,
    drawsTotal: drawCount(r),
    mine: mine ? { ...mine, wins: r.draws.filter((d) => d.name === mine.name).length } : null,
    countingFrom,
    updatedAt: Date.now(),
  }
}

// ---------------------------------------------------------------- settings

const num = (v: unknown, label: string, min: number, max: number) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max.toLocaleString('en-US')}.`)
  return n
}

function applySettings(r: Raffle, body: Record<string, unknown>): Raffle {
  const next = { ...r }
  if ('title' in body) {
    next.title = String(body.title ?? '').trim().slice(0, 60)
    if (!next.title) throw new InputError('Give the raffle a title.')
  }
  if ('prizePool' in body) next.prizePool = Math.round(num(body.prizePool, 'Prize pool', 1, 10_000_000) * 100) / 100
  if ('prizePerDraw' in body) next.prizePerDraw = Math.round(num(body.prizePerDraw, 'Prize per draw', 1, 10_000_000) * 100) / 100
  if ('maxWinsPerPerson' in body) next.maxWinsPerPerson = Math.round(num(body.maxWinsPerPerson, 'Max wins per person', 1, 100))
  if ('ticketUnit' in body) next.ticketUnit = num(body.ticketUnit, next.kind === 'wager' ? 'Dollars per ticket' : 'Minutes per ticket', 1, 10_000_000)
  if ('start' in body) next.start = num(body.start, 'Start', 0, 8.64e15)
  if ('end' in body) next.end = num(body.end, 'End', 0, 8.64e15)
  if (next.end <= next.start) throw new InputError('The end must be after the start.')
  if (next.prizePerDraw > next.prizePool) throw new InputError('The prize per draw can’t be more than the pool.')
  return next
}

// ---------------------------------------------------------------- handler

export async function handleRaffleRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  if (path !== '/api/raffles' && !path.startsWith('/api/admin/raffles')) return null
  const user = readSession(req, env)

  try {
    if (path === '/api/raffles') {
      const all = await read('raffles')
      const current = (['wager', 'watch'] as RaffleKind[])
        .map((k) => all.find((r) => r.kind === k))
        .filter((r): r is Raffle => Boolean(r))
      const me = { stake: user?.stake?.username, kick: user?.kick?.username }
      return json(200, { raffles: await Promise.all(current.map((r) => publicView(r, env, me))) })
    }

    if (!isAdmin(user, env)) return json(user ? 403 : 401, { error: 'Admins only.' })
    const rest = path.slice('/api/admin/raffles'.length).replace(/^\//, '')

    if (!rest && req.method === 'GET') {
      const all = await read('raffles')
      const out = await Promise.all(
        all.map(async (r) => {
          try {
            const { entries, countingFrom } = await entriesOf(r, env)
            const { total, list } = withOdds(entries)
            return { ...sealed(r), entries: list, totalTickets: total, drawsTotal: drawCount(r), countingFrom, error: null }
          } catch (err) {
            return { ...sealed(r), entries: [], totalTickets: 0, drawsTotal: drawCount(r), countingFrom: null, error: err instanceof Error ? err.message : 'Could not count tickets.' }
          }
        }),
      )
      return json(200, { raffles: out })
    }

    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {
      throw new InputError('Send a JSON object.')
    }

    if (rest === 'baseline') {
      await watchTotals(Date.now(), true)
      liveCache.clear()
      return json(200, { ok: true })
    }

    if (!rest) {
      const kind = body.kind === 'watch' ? 'watch' : body.kind === 'wager' ? 'wager' : null
      if (!kind) throw new InputError('Pick a wager or watch-time raffle.')
      const { start, end } = monthWindow()
      const base: Raffle = {
        id: randomBytes(6).toString('hex'),
        kind,
        ...DEFAULT_RAFFLE[kind],
        start,
        end,
        status: 'open',
        entries: [],
        seedHash: null,
        seed: null,
        draws: [],
        createdAt: Date.now(),
        lockedAt: null,
        completedAt: null,
      }
      const raffle = applySettings(base, body)
      await update('raffles', (list) => [raffle, ...list])
      return json(200, { raffle: sealed(raffle) })
    }

    const [id, action] = rest.split('/')
    const current = (await read('raffles')).find((r) => r.id === id)
    if (!current) throw new InputError('That raffle no longer exists.')

    if (action === 'delete') {
      await update('raffles', (list) => list.filter((r) => r.id !== id))
      return json(200, { ok: true })
    }

    if (!action) {
      if (current.status !== 'open') throw new InputError('Unlock the raffle to change its settings.')
      const next = applySettings(current, body)
      await update('raffles', (list) => list.map((r) => (r.id === id ? next : r)))
      liveCache.clear()
      return json(200, { raffle: sealed(next) })
    }

    if (action === 'lock') {
      if (current.status !== 'open') throw new InputError('This raffle is already locked.')
      liveCache.clear()
      const { entries } = await entriesOf(current, env, true)
      if (!entries.length) throw new InputError('Nobody has a ticket yet.')
      const seed = randomBytes(32).toString('hex')
      const next: Raffle = {
        ...current,
        // Already counted with this raffle's unit, in the fixed order the draws use
        entries,
        status: 'locked',
        seed,
        seedHash: createHash('sha256').update(seed).digest('hex'),
        lockedAt: Date.now(),
      }
      await update('raffles', (list) => list.map((r) => (r.id === id ? next : r)))
      return json(200, { raffle: sealed(next) })
    }

    if (action === 'unlock') {
      if (current.status !== 'locked' || current.draws.length) throw new InputError('Only a locked raffle with no draws can be unlocked.')
      const next: Raffle = { ...current, status: 'open', entries: [], seed: null, seedHash: null, lockedAt: null }
      await update('raffles', (list) => list.map((r) => (r.id === id ? next : r)))
      return json(200, { raffle: sealed(next) })
    }

    if (action === 'draw') {
      let drawn: Raffle | undefined
      if (current.status !== 'locked' || !current.seed) {
        throw new InputError(current.status === 'open' ? 'Lock the raffle first.' : 'Every draw has been made.')
      }
      // Computed outside the store's queue (it's async); the save below checks nobody drew meanwhile
      const fresh = current
      const next = await drawNext(fresh, fresh.seed!, fresh.draws)
      if (!next) throw new InputError('Everyone left has reached the win cap.')
      await update('raffles', (list) =>
        list.map((r) => {
          if (r.id !== id) return r
          if (r.draws.length !== fresh.draws.length) throw new InputError('Someone else drew at the same moment. Try again.')
          const draws = [...r.draws, { n: r.draws.length, ticket: next.ticket, pool: next.pool, name: next.name, prize: r.prizePerDraw, at: Date.now() }]
          const done = draws.length >= drawCount(r)
          drawn = { ...r, draws, status: done ? 'complete' : 'locked', completedAt: done ? Date.now() : null }
          return drawn
        }),
      )
      // The last possible draw also finishes it (when the cap empties the pool early)
      if (drawn && drawn.status === 'locked' && !(await drawNext(drawn, drawn.seed!, drawn.draws))) {
        drawn = { ...drawn, status: 'complete', completedAt: Date.now() }
        const final = drawn
        await update('raffles', (list) => list.map((r) => (r.id === id ? final : r)))
      }
      return json(200, { raffle: sealed(drawn!), draw: drawn!.draws[drawn!.draws.length - 1] })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
