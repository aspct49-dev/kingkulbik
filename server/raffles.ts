/*
 * Monthly raffles: wager (Stake) and watch time (BotRix).
 *
 * Tickets
 *   Wager: Stake's affiliate leaderboard for the raffle's dates (customRange),
 *   one ticket per `ticketUnit` dollars wagered under the code.
 *   Watch: BotRix only publishes all-time watch minutes (top 100, or one name
 *   by search) with no monthly table. So the first time a raffle is counted,
 *   the server saves everyone's all-time minutes as its baseline; the raffle's
 *   watch time is the current total minus the baseline. It covers BotRix's
 *   top 100, everyone who signed in with Kick, and everyone seen in Kick chat
 *   (server/kickChat.ts); someone seen for the first time mid-raffle counts
 *   from then, which for a chatter is their first message. On the VPS a
 *   background count runs every 30 s, so that first look happens within a
 *   minute or so whether or not anyone has the raffle page open.
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
 *   POST /api/admin/raffles/<id>/lock          freeze tickets, commit the seed ({ snapshot: at } locks with a saved copy)
 *   GET  /api/admin/raffles/<id>/snapshots     the saved copies of the ticket list
 *   GET  /api/admin/raffles/<id>/snapshots/<at>  one of them, with tickets
 *   POST /api/admin/raffles/<id>/unlock        back to open (before any draw)
 *   POST /api/admin/raffles/<id>/draw          the next draw
 *   POST /api/admin/raffles/<id>/delete
 *   POST /api/admin/raffles/baseline           open watch raffles count from now
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
import type { PublicRaffle, Raffle, RaffleEntry, RaffleKind, RaffleSnapshot, RaffleSnapshotSummary } from '../shared/raffles.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { BOTRIX_CHANNEL, getBotrixViewer } from './botrix.js'
import { chattersSince } from './kickChat.js'
import { kickLive } from './socials.js'
import { parseLeaderboardCsv } from './stakeLeaderboard.js'
import { read, StoreError, update } from './store.js'

class InputError extends Error {}

const CACHE_MS = 60_000
const OFFLINE_CACHE_MS = 15 * 60_000
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

/**
 * The most minutes ever seen per viewer. All-time minutes only go up, but
 * BotRix's top 100 is cached on its side (sometimes behind a viewer's own
 * lookup), a lookup can fail when it's busy, and people drop out of the top
 * 100: without this, they'd drop out of a raffle or lose tickets. Saved
 * (watchSeen) so a restart doesn't forget anyone either.
 */
const highest = new Map<string, BotrixRow>()
let seenLoaded = false
let seenSavedAt = 0
let seenChanged = false
const SEEN_SAVE_MS = 60_000

async function loadSeen() {
  if (seenLoaded) return
  const saved = await read('watchSeen')
  for (const [key, r] of Object.entries(saved)) if (!highest.has(key) || highest.get(key)!.watchtime < r.watchtime) highest.set(key, r)
  seenLoaded = true
}

async function saveSeen() {
  if (!seenChanged || Date.now() - seenSavedAt < SEEN_SAVE_MS) return
  seenChanged = false
  seenSavedAt = Date.now()
  const snapshot = Object.fromEntries(highest)
  await update('watchSeen', () => snapshot).catch(() => (seenChanged = true))
}

/** When each viewer was last looked up on BotRix (ms, by lowercase name) */
const lookedUp = new Map<string, number>()
/** Chatted this recently: may be earning minutes right now */
const ACTIVE_FOR_MS = 20 * 60_000
/** BotRix adds watch time in 10-minute steps, so asking more often than this gains nothing */
const ACTIVE_EVERY_MS = 4 * 60_000
/** After someone goes quiet, one more look this much later catches BotRix's last step */
const SETTLE_MS = 12 * 60_000
/** Signed-in viewers not seen in chat: live, and off stream */
const QUIET_EVERY_MS = 15 * 60_000
const OFFLINE_EVERY_MS = 60 * 60_000
/** At most this many lookups per count (eight at a time); the rest go first next time */
const LOOKUPS_PER_COUNT = 400

/**
 * Whether a viewer's BotRix minutes are worth asking for again. Anyone never
 * looked up goes first (that sets where their raffle count starts). Chatters
 * are asked every few minutes while active, once more after they go quiet,
 * then not until they chat again. Signed-in viewers who don't chat, now and then.
 */
function due(key: string, chatted: number | null, live: boolean | null, now: number) {
  const last = lookedUp.get(key)
  if (last === undefined) return true
  if (chatted !== null) {
    if (now - chatted < ACTIVE_FOR_MS) return now - last > ACTIVE_EVERY_MS
    return last < chatted + ACTIVE_FOR_MS + SETTLE_MS && now >= chatted + ACTIVE_FOR_MS + SETTLE_MS
  }
  return now - last > (live === false ? OFFLINE_EVERY_MS : QUIET_EVERY_MS)
}

/**
 * All-time minutes for BotRix's top 100, every Kick account linked on the
 * site, everyone seen in Kick chat since `since` (server/kickChat.ts), and
 * everyone already in the raffle (`known`, lowercase names: someone who has
 * since dropped out of the top 100 is still looked up).
 */
async function watchNow(since: number, known: string[] = []): Promise<Map<string, BotrixRow>> {
  await loadSeen().catch(() => undefined)
  const now = Date.now()
  const out = new Map<string, BotrixRow>()
  for (const r of await botrixTop()) out.set(r.name.toLowerCase(), r)

  const names = new Map<string, { name: string; chatted: number | null }>()
  for (const key of known) names.set(key, { name: highest.get(key)?.name ?? key, chatted: null })
  for (const p of await read('players')) if (p.kick?.username) names.set(p.kick.username.toLowerCase(), { name: p.kick.username, chatted: null })
  for (const c of await chattersSince(since)) names.set(c.name.toLowerCase(), { name: c.name, chatted: c.lastSeen })

  const live = await kickLive()
  const ask = [...names]
    .filter(([key, v]) => due(key, v.chatted, live, now))
    .sort(([a], [b]) => (lookedUp.get(a) ?? 0) - (lookedUp.get(b) ?? 0))
    .slice(0, LOOKUPS_PER_COUNT)
  // Eight at a time: quick with many viewers, gentle on BotRix. Their own lookup is fresher than the top 100
  for (let i = 0; i < ask.length; i += 8) {
    await Promise.all(
      ask.slice(i, i + 8).map(async ([key, v]) => {
        const found = await getBotrixViewer(v.name).catch(() => undefined)
        if (found === undefined) return // BotRix didn't answer: asked again next time
        lookedUp.set(key, Date.now())
        if (found) out.set(found.name.toLowerCase(), { name: found.name, watchtime: found.watchtime })
      }),
    )
  }
  for (const [key, r] of out) {
    const best = highest.get(key)
    if (best && best.watchtime >= r.watchtime) out.set(key, best)
    else {
      highest.set(key, r)
      seenChanged = true
    }
  }
  // Seen before but missing this time (a failed lookup, or out of the top 100): keep their last count
  for (const [key, r] of highest) if (!out.has(key)) out.set(key, r)
  await saveSeen()
  return out
}

type Baseline = { month: string; takenAt: number; minutes: Record<string, number> }

/**
 * A watch raffle's minutes per viewer: current all-time minus the raffle's
 * baseline (everyone's all-time minutes when it was first counted). Each
 * raffle has its own, so a second raffle in a month doesn't count the first
 * one's minutes. A raffle from before that (when the month shared one) keeps
 * the month's, if taken after it was created.
 */
async function watchTotals(r: Raffle, reset = false) {
  const key = `raffle:${r.id}`
  const saved = await read('watchBaselines')
  const known = saved.find((b) => b.month === key)?.minutes ?? {}
  const now = await watchNow(Math.min(r.start, r.createdAt), Object.keys(known))
  const all = await read('watchBaselines')
  let baseline: Baseline | undefined = all.find((b) => b.month === key)
  if (!baseline && !reset) {
    const month = all.find((b) => b.month === monthKey(r.start) && b.takenAt >= r.createdAt)
    if (month) baseline = { ...month, month: key }
  }
  const missing = [...now.values()].filter((v) => !baseline || reset || !(v.name.toLowerCase() in baseline.minutes))
  const stored = all.some((b) => b.month === key)
  if (!baseline || reset || missing.length || !stored) {
    // First count (or a reset): today's total is the starting point; someone seen for the first time counts from now
    const next: Baseline = {
      month: key,
      takenAt: !baseline || reset ? Date.now() : baseline.takenAt,
      minutes: !baseline || reset ? {} : { ...baseline.minutes },
    }
    for (const v of missing) next.minutes[v.name.toLowerCase()] = v.watchtime
    await update('watchBaselines', (list) => [next, ...list.filter((b) => b.month !== key)].slice(0, 48)).catch(() => undefined)
    baseline = next
  }
  const rows = [...now.values()]
    .map((v) => ({ name: v.name, amount: Math.max(0, v.watchtime - (baseline!.minutes[v.name.toLowerCase()] ?? v.watchtime)) }))
    .filter((v) => v.amount > 0)
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
      : await watchTotals(r).then(({ rows, countingFrom }) => ({
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
  // Off stream, watch time can't grow: recount every 15 minutes instead of every minute
  const ttl = r.kind === 'watch' && (await kickLive()) === false ? OFFLINE_CACHE_MS : CACHE_MS
  if (hit && Date.now() - hit.at < ttl) return hit
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

/**
 * On the VPS: keep open watch raffles counted without waiting for visitors, so
 * a new chatter's starting point is taken soon after their first message.
 * entriesOf decides whether a count is due (every minute live, 15 off stream).
 */
export function startWatchCounter(env: AuthEnv) {
  let running = false
  setInterval(() => {
    if (running) return
    running = true
    read('raffles')
      .then((all) =>
        Promise.all(
          all
            .filter((r) => r.status === 'open')
            .map(async (r) => {
              if (r.kind === 'watch') await entriesOf(r, env)
              await hourlySnapshot(r, env)
            }),
        ),
      )
      .catch(() => undefined)
      .finally(() => (running = false))
  }, 30_000).unref()
}

// ---------------------------------------------------------------- snapshots

const SNAPSHOT_EVERY_MS = 3600_000
/** Every snapshot is kept this long; older ones, one per day */
const KEEP_ALL_MS = 48 * 3600_000
const KEEP_MS = 60 * 24 * 3600_000

/** Hourly for two days, then the last of each day, for 60 days; lock and reset copies stay for the 60 */
function prune(list: RaffleSnapshot[], now: number) {
  const days = new Set<string>()
  return list.filter((s) => {
    if (now - s.at > KEEP_MS) return false
    if (now - s.at <= KEEP_ALL_MS || s.reason !== 'hourly') return true
    const day = new Date(s.at).toISOString().slice(0, 10)
    if (days.has(day)) return false
    days.add(day)
    return true
  })
}

/** Save a copy of the ticket list (an hourly one only when something changed since the last) */
async function snapshot(r: Raffle, entries: RaffleEntry[], reason: RaffleSnapshot['reason']) {
  const rows = entries.map((e): [string, number] => [e.name, e.amount])
  const now = Date.now()
  await update('raffleSnapshots', (all) => {
    const list = all[r.id] ?? []
    if (reason === 'hourly' && list[0] && JSON.stringify(list[0].rows) === JSON.stringify(rows)) return all
    return { ...all, [r.id]: prune([{ at: now, reason, rows }, ...list], now) }
  })
}

async function hourlySnapshot(r: Raffle, env: AuthEnv) {
  const last = (await read('raffleSnapshots'))[r.id]?.find((s) => s.reason === 'hourly')
  if (last && Date.now() - last.at < SNAPSHOT_EVERY_MS) return
  const { entries } = await entriesOf(r, env)
  // Nothing counted yet: nothing worth keeping
  if (entries.length) await snapshot(r, entries, 'hourly')
}

const summarize = (s: RaffleSnapshot, unit: number): RaffleSnapshotSummary => {
  const entries = freezeEntries(s.rows.map(([name, amount]) => ({ name, amount })), unit)
  return { at: s.at, reason: s.reason, players: entries.length, tickets: entries.reduce((t, e) => t + e.tickets, 0) }
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
  const shown = (name: string) => (r.kind === 'wager' ? maskName(name) : name)
  return {
    ...sealed(r),
    entries: list.map((e) => ({ ...e, name: shown(e.name) })),
    draws: r.draws.map((d) => ({ ...d, name: shown(d.name) })),
    totalTickets: total,
    drawsTotal: drawCount(r),
    // Named as in the entries, so the page can find its own row
    mine: mine ? { ...mine, name: shown(mine.name), wins: r.draws.filter((d) => d.name === mine.name).length } : null,
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

    const snapshots = rest.match(/^([\w-]+)\/snapshots(?:\/(\d+))?$/)
    if (snapshots && req.method === 'GET') {
      const raffle = (await read('raffles')).find((r) => r.id === snapshots[1])
      if (!raffle) throw new InputError('That raffle no longer exists.')
      const list = (await read('raffleSnapshots'))[raffle.id] ?? []
      if (!snapshots[2]) return json(200, { snapshots: list.map((s) => summarize(s, raffle.ticketUnit)) })
      const one = list.find((s) => s.at === Number(snapshots[2]))
      if (!one) throw new InputError('That snapshot no longer exists.')
      const entries = freezeEntries(one.rows.map(([name, amount]) => ({ name, amount })), raffle.ticketUnit)
      return json(200, { snapshot: { ...summarize(one, raffle.ticketUnit), entries } })
    }

    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {
      throw new InputError('Send a JSON object.')
    }

    if (rest === 'baseline') {
      for (const r of await read('raffles')) {
        if (r.kind !== 'watch' || r.status !== 'open') continue
        // What it was before, in case the reset wasn't meant
        const { entries } = await entriesOf(r, env).catch(() => ({ entries: [] as RaffleEntry[] }))
        if (entries.length) await snapshot(r, entries, 'reset')
        await watchTotals(r, true)
      }
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
      let entries: RaffleEntry[]
      if (body.snapshot !== undefined) {
        // Lock with a saved copy (when the live count is off at draw time)
        const saved = (await read('raffleSnapshots'))[id]?.find((s) => s.at === Number(body.snapshot))
        if (!saved) throw new InputError('That snapshot no longer exists.')
        entries = freezeEntries(saved.rows.map(([name, amount]) => ({ name, amount })), current.ticketUnit)
      } else {
        entries = (await entriesOf(current, env, true)).entries
      }
      if (!entries.length) throw new InputError('Nobody has a ticket yet.')
      await snapshot(current, entries, 'lock')
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
