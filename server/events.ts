/*
 * Stream events on the server: bonus hunts, guess the balance, slot
 * tournaments and the Kick chat giveaway.
 *
 * Public
 *   GET  /api/events/hunt               the current hunt (newest)
 *   GET  /api/events/guess              the current round (other guesses hidden until the draw)
 *   POST /api/events/guess              { value }   one guess per Discord account, changeable while open
 *   GET  /api/events/tournaments        published brackets, newest first
 *   GET  /api/events/giveaway           the current giveaway and past winners
 *
 * Admin (ADMIN_DISCORD_IDS)
 *   POST /api/admin/hunts               { name, startBalance }
 *   POST /api/admin/hunts/<id>          the whole hunt (name, startBalance, status, bonuses)
 *   POST /api/admin/hunts/<id>/delete
 *   POST /api/admin/guess               { name, prize, huntId }   (closes any open round)
 *   POST /api/admin/guess/<id>          { status: 'open' | 'closed' }
 *   POST /api/admin/guess/<id>/draw     { finalBalance }
 *   POST /api/admin/guess/<id>/remove   { userId }
 *   POST /api/admin/guess/<id>/delete
 *   POST /api/admin/tournaments         { name, prize, size }
 *   POST /api/admin/tournaments/<id>    { name?, prize?, status?, matches? }
 *   POST /api/admin/tournaments/<id>/delete
 *   GET  /api/admin/kick                King Kulbik's chatroom id and live status
 *   POST /api/admin/giveaway/start      { prize, keyword, minPoints }
 *   POST /api/admin/giveaway/update     { prize?, keyword?, minPoints?, open? }
 *   POST /api/admin/giveaway/enter      { entries: [{ kickId, name }] }   (chat, forwarded by the admin's browser)
 *   POST /api/admin/giveaway/draw
 *   POST /api/admin/giveaway/remove     { kickId }
 *   POST /api/admin/giveaway/restore    { kickId }
 *   POST /api/admin/giveaway/end
 *
 * The giveaway reads Kick chat in the admin's browser (a socket can't live in
 * a serverless function), but who may enter and who wins is decided here.
 */

import { randomBytes, randomInt } from 'node:crypto'
import {
  buildBracket,
  championOf,
  huntStats,
  isBracketSize,
  KICK_CHANNEL,
  KICK_CHATROOM_ID,
  rankGuesses,
} from '../shared/events.js'
import type {
  Giveaway,
  GiveawayEntry,
  GuessRound,
  Hunt,
  HuntBonus,
  HuntStatus,
  Match,
  Player,
  PublicGiveaway,
  PublicGuessRound,
  Tournament,
} from '../shared/events.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { getBotrixViewer } from './botrix.js'
import { read, StoreError, update, write } from './store.js'

class InputError extends Error {}

const newId = () => randomBytes(6).toString('hex')

function parseBody(body: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(body || '{}') as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    /* falls through */
  }
  throw new InputError('Send a JSON object.')
}

const text = (v: unknown, label: string, max: number, required = true) => {
  const s = String(v ?? '').trim().slice(0, max)
  if (required && !s) throw new InputError(`${label} is required.`)
  return s
}

const money = (v: unknown, label: string, max = 100_000_000) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new InputError(`${label} must be between 0 and ${max.toLocaleString('en-US')}.`)
  return Math.round(n * 100) / 100
}

/** Only art we'd put on a public page: our files, uploads, or Stake's catalog */
function safeImage(v: unknown): string | undefined {
  const s = String(v ?? '').trim()
  if (/^\/content\/[\w./-]+$/.test(s) && !s.includes('..')) return s
  if (/^\/api\/uploads\/[a-z0-9-]+\.(webp|png|jpg|gif)$/.test(s)) return s
  if (/^https:\/\/mediumrare\.imgix\.net\/[\w./%-]+(\?[\w=&.%-]*)?$/.test(s)) return s
  return undefined
}

const safeSlug = (v: unknown) => {
  const s = String(v ?? '').trim()
  return /^[a-z0-9-]{1,120}$/.test(s) ? s : undefined
}

// ---------------------------------------------------------------- hunts

const HUNT_STATUSES: HuntStatus[] = ['collecting', 'opening', 'finished']

function normaliseBonus(raw: unknown): HuntBonus {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : newId()
  const payout = r.payout === null || r.payout === undefined || r.payout === '' ? null : money(r.payout, 'Payout')
  return {
    id,
    game: text(r.game, 'Each bonus needs a game', 60),
    ...(safeSlug(r.slug) ? { slug: safeSlug(r.slug) } : {}),
    ...(safeImage(r.image) ? { image: safeImage(r.image) } : {}),
    ...(r.provider ? { provider: text(r.provider, 'Provider', 40, false) } : {}),
    bet: money(r.bet, 'Bet size', 1_000_000),
    payout,
  }
}

function normaliseHunt(body: Record<string, unknown>, current: Hunt): Hunt {
  const status = HUNT_STATUSES.includes(body.status as HuntStatus) ? (body.status as HuntStatus) : current.status
  const bonuses = Array.isArray(body.bonuses) ? body.bonuses.slice(0, 300).map(normaliseBonus) : current.bonuses
  return {
    ...current,
    name: 'name' in body ? text(body.name, 'Name', 60) : current.name,
    startBalance: 'startBalance' in body ? money(body.startBalance, 'Start balance') : current.startBalance,
    status,
    bonuses,
    finishedAt: status === 'finished' ? (current.finishedAt ?? Date.now()) : null,
  }
}

// ---------------------------------------------------------------- tournaments

function normalisePlayer(raw: unknown): Player {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    name: text(r.name, 'Name', 40, false),
    slot: text(r.slot, 'Slot', 60, false),
    ...(safeSlug(r.slug) ? { slug: safeSlug(r.slug) } : {}),
    ...(safeImage(r.image) ? { image: safeImage(r.image) } : {}),
  }
}

const multiplier = (raw: unknown) => {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : null
}

/** Rebuild the bracket from the browser's copy onto a skeleton of the right size */
function normaliseBracket(t: Tournament, input: unknown): Match[] {
  if (!Array.isArray(input)) throw new InputError('Send the whole bracket.')
  const byId = new Map<string, Record<string, unknown>>()
  for (const entry of input) {
    if (entry && typeof entry === 'object' && typeof (entry as Match).id === 'string') byId.set((entry as Match).id, entry as Record<string, unknown>)
  }
  return buildBracket(t.size).map((base) => {
    const raw = byId.get(base.id)
    if (!raw) throw new InputError('That bracket does not match this tournament.')
    return {
      ...base,
      player1: normalisePlayer(raw.player1),
      player2: normalisePlayer(raw.player2),
      mult1: multiplier(raw.mult1),
      mult2: multiplier(raw.mult2),
      winner: raw.winner === 'p1' || raw.winner === 'p2' ? raw.winner : null,
    }
  })
}

// ---------------------------------------------------------------- guess the balance

async function publicGuessRound(userId: string | null): Promise<PublicGuessRound | null> {
  const rounds = await read('guesses')
  const round = rounds.find((r) => r.status !== 'drawn') ?? rounds[0]
  if (!round) return null
  const hunt = round.huntId ? (await read('hunts')).find((h) => h.id === round.huntId) : undefined
  const { guesses, ...rest } = round
  return {
    ...rest,
    count: guesses.length,
    mine: (userId && guesses.find((g) => g.userId === userId)) || null,
    // Avatars stay off the public list; names and figures only
    standings: rankGuesses(round)
      .slice(0, 25)
      .map((g) => ({ ...g, userId: '', avatar: null })),
    hunt: hunt
      ? (() => {
          const stats = huntStats(hunt)
          return {
            name: hunt.name,
            status: hunt.status,
            startBalance: hunt.startBalance,
            count: stats.count,
            opened: stats.opened,
            totalWon: stats.totalWon,
            breakEven: stats.breakEven,
          }
        })()
      : null,
  }
}

// ---------------------------------------------------------------- giveaway

function publicGiveaway(g: Giveaway | null): PublicGiveaway {
  if (!g) return null
  return {
    id: g.id,
    prize: g.prize,
    keyword: g.keyword,
    open: g.open,
    minPoints: g.minPoints,
    count: g.entries.length,
    recent: g.entries.slice(-12).reverse().map((e) => e.name),
    winners: g.winners.map((w) => ({ name: w.name, drawnAt: w.drawnAt })),
    reel: g.reel,
  }
}

const keyword = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (!/^\S{1,24}$/.test(s)) throw new InputError('The keyword is one word, up to 24 characters (e.g. !join).')
  return s
}

/** Points gate: entrants checked against BotRix, a few at a time */
async function screen(candidates: GiveawayEntry[], minPoints: number) {
  if (minPoints <= 0) return candidates.map((c) => ({ entry: c, reason: null as string | null }))
  const out: { entry: GiveawayEntry; reason: string | null }[] = []
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5)
    const checked = await Promise.all(
      batch.map(async (entry) => {
        try {
          const viewer = await getBotrixViewer(entry.name)
          const points = viewer?.points ?? 0
          return { entry, reason: points >= minPoints ? null : `Has ${points.toLocaleString('en-US')} King Points` }
        } catch {
          return { entry, reason: 'BotRix did not answer' }
        }
      }),
    )
    out.push(...checked)
  }
  return out
}

// ---------------------------------------------------------------- handler

export async function handleEventsRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const path = new URL(req.url, 'http://localhost').pathname
  const user = readSession(req, env)

  try {
    // ---- public
    if (path === '/api/events/hunt') {
      const hunts = await read('hunts')
      return json(200, { hunt: hunts[0] ?? null })
    }
    if (path === '/api/events/tournaments') {
      return json(200, { tournaments: (await read('tournaments')).filter((t) => t.status !== 'draft') })
    }
    if (path === '/api/events/giveaway') {
      return json(200, { giveaway: publicGiveaway(await read('giveaway')), history: (await read('raffleWins')).slice(0, 20) })
    }
    if (path === '/api/events/guess') {
      if (req.method === 'POST') {
        if (!user) return json(401, { error: 'Sign in with Discord to guess.' })
        const value = money(parseBody(req.body).value, 'Your guess', 1_000_000_000)
        if (value <= 0) throw new InputError('Enter a balance above $0.')
        await update('guesses', (rounds) => {
          const round = rounds.find((r) => r.status !== 'drawn') ?? rounds[0]
          if (!round) throw new InputError('There is no round right now.')
          if (round.status !== 'open') throw new InputError('Entries are closed for this round.')
          round.guesses = round.guesses.filter((g) => g.userId !== user.discord.id)
          round.guesses.push({ userId: user.discord.id, name: user.discord.name, avatar: user.discord.avatar, value, at: Date.now() })
          return rounds
        })
      }
      return json(200, { round: await publicGuessRound(user?.discord.id ?? null) })
    }

    const admin = path.match(/^\/api\/admin\/(hunts|guess|tournaments|giveaway|kick)(?:\/(.*))?$/)
    if (!admin) return null
    if (!isAdmin(user, env)) return json(user ? 403 : 401, { error: 'Admins only.' })
    const [, area, rest = ''] = admin

    if (area === 'kick') {
      // The chatroom id is fixed; the lookup adds whether the stream is live
      try {
        const res = await fetch(`https://kick.com/api/v2/channels/${KICK_CHANNEL}`, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        })
        const d = (await res.json()) as { chatroom?: { id?: number }; livestream?: unknown }
        return json(200, { chatroomId: d.chatroom?.id ?? KICK_CHATROOM_ID, live: Boolean(d.livestream) })
      } catch {
        return json(200, { chatroomId: KICK_CHATROOM_ID, live: null })
      }
    }

    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    const body = parseBody(req.body)

    // ---- hunts
    if (area === 'hunts') {
      if (!rest) {
        const hunt: Hunt = {
          id: newId(),
          name: text(body.name, 'Name', 60),
          startBalance: money(body.startBalance, 'Start balance'),
          status: 'collecting',
          bonuses: [],
          createdAt: Date.now(),
          finishedAt: null,
        }
        return json(200, { hunts: await update('hunts', (list) => [hunt, ...list]) })
      }
      const [id, action] = rest.split('/')
      const hunts = await update('hunts', (list) => {
        const i = list.findIndex((h) => h.id === id)
        if (i < 0) throw new InputError('That hunt no longer exists.')
        if (action === 'delete') return list.filter((_, j) => j !== i)
        if (action) throw new InputError('Unknown action.')
        list[i] = normaliseHunt(body, list[i])
        return list
      })
      return json(200, { hunts })
    }

    // ---- guess the balance
    if (area === 'guess') {
      if (!rest) {
        const huntId = typeof body.huntId === 'string' && body.huntId ? body.huntId : null
        if (huntId && !(await read('hunts')).some((h) => h.id === huntId)) throw new InputError('That hunt no longer exists.')
        const round: GuessRound = {
          id: newId(),
          name: text(body.name, 'Name', 60),
          prize: text(body.prize, 'Prize', 40, false),
          huntId,
          status: 'open',
          guesses: [],
          finalBalance: null,
          createdAt: Date.now(),
          drawnAt: null,
        }
        // The page shows one round at a time: an older open round stops taking guesses
        const guesses = await update('guesses', (list) => [
          round,
          ...list.map((r) => (r.status === 'open' ? { ...r, status: 'closed' as const } : r)),
        ])
        return json(200, { guesses })
      }
      const [id, action] = rest.split('/')
      const guesses = await update('guesses', (list) => {
        const round = list.find((r) => r.id === id)
        if (!round) throw new InputError('That round no longer exists.')
        if (action === 'delete') return list.filter((r) => r.id !== id)
        if (action === 'draw') {
          round.finalBalance = money(body.finalBalance, 'Final balance')
          round.status = 'drawn'
          round.drawnAt = Date.now()
        } else if (action === 'remove') {
          round.guesses = round.guesses.filter((g) => g.userId !== String(body.userId))
        } else if (!action) {
          if (body.status !== 'open' && body.status !== 'closed') throw new InputError('Status is open or closed.')
          round.status = body.status
          round.finalBalance = null
          round.drawnAt = null
          if (body.status === 'open') {
            for (const r of list) if (r !== round && r.status === 'open') r.status = 'closed'
          }
        } else throw new InputError('Unknown action.')
        return list
      })
      return json(200, { guesses })
    }

    // ---- tournaments
    if (area === 'tournaments') {
      if (!rest) {
        const size = Number(body.size)
        if (!isBracketSize(size)) throw new InputError('Pick 4, 8, 16 or 32 players.')
        const t: Tournament = {
          id: newId(),
          name: text(body.name, 'Name', 60),
          prize: text(body.prize, 'Prize', 40, false),
          size,
          status: 'draft',
          matches: buildBracket(size),
          createdAt: Date.now(),
          completedAt: null,
        }
        return json(200, { tournaments: await update('tournaments', (list) => [t, ...list]) })
      }
      const [id, action] = rest.split('/')
      const tournaments = await update('tournaments', (list) => {
        const i = list.findIndex((t) => t.id === id)
        if (i < 0) throw new InputError('That tournament no longer exists.')
        if (action === 'delete') return list.filter((_, j) => j !== i)
        if (action) throw new InputError('Unknown action.')
        const t = { ...list[i] }
        if ('name' in body) t.name = text(body.name, 'Name', 60)
        if ('prize' in body) t.prize = text(body.prize, 'Prize', 40, false)
        if ('matches' in body) t.matches = normaliseBracket(t, body.matches)
        if (body.status === 'draft' || body.status === 'live') t.status = body.status
        // Complete is derived: the final has a winner
        const done = championOf(t.matches) !== null
        if (t.status !== 'draft') t.status = done ? 'complete' : 'live'
        t.completedAt = t.status === 'complete' ? (t.completedAt ?? Date.now()) : null
        list[i] = t
        return list
      })
      return json(200, { tournaments })
    }

    // ---- giveaway
    if (area === 'giveaway') {
      if (rest === 'start') {
        const g: Giveaway = {
          id: newId(),
          prize: text(body.prize, 'Prize', 60),
          keyword: keyword(body.keyword),
          open: true,
          minPoints: Math.round(money(body.minPoints ?? 0, 'Minimum King Points', 100_000_000)),
          entries: [],
          removed: [],
          winners: [],
          refused: [],
          reel: [],
          createdAt: Date.now(),
        }
        await write('giveaway', g)
        return json(200, { giveaway: g })
      }
      if (rest === 'end') {
        await write('giveaway', null)
        return json(200, { giveaway: null })
      }

      const current = await read('giveaway')
      if (!current) throw new InputError('Start a giveaway first.')

      if (rest === 'enter') {
        if (!current.open) return json(200, { giveaway: current, added: 0 })
        const seen = new Set([...current.entries, ...current.removed, ...current.winners].map((e) => e.kickId))
        const incoming: GiveawayEntry[] = []
        for (const raw of Array.isArray(body.entries) ? body.entries.slice(0, 100) : []) {
          const r = (raw ?? {}) as Record<string, unknown>
          const kickId = String(r.kickId ?? '').slice(0, 30)
          const name = String(r.name ?? '').trim().slice(0, 40)
          if (!kickId || !name || seen.has(kickId)) continue
          seen.add(kickId)
          incoming.push({ kickId, name, at: Date.now() })
        }
        const results = await screen(incoming, current.minPoints)
        const giveaway = await update('giveaway', (g) => {
          if (!g || g.id !== current.id) return g
          const have = new Set(g.entries.map((e) => e.kickId))
          for (const { entry, reason } of results) {
            if (reason) g.refused = [{ name: entry.name, reason, at: Date.now() }, ...g.refused].slice(0, 20)
            else if (!have.has(entry.kickId)) g.entries.push(entry)
          }
          return g
        })
        return json(200, { giveaway, added: results.filter((r) => !r.reason).length })
      }

      if (rest === 'draw') {
        let winnerName = ''
        const giveaway = await update('giveaway', (g) => {
          if (!g || !g.entries.length) throw new InputError('Nobody has entered yet.')
          const i = randomInt(g.entries.length)
          const winner = g.entries[i]
          winnerName = winner.name
          // A reel of random entrants for the overlay, landing on the winner
          const pool = g.entries.filter((_, j) => j !== i)
          const reel = Array.from({ length: Math.min(40, Math.max(12, pool.length)) }, () =>
            pool.length ? pool[randomInt(pool.length)].name : winner.name,
          )
          g.reel = [...reel, winner.name]
          g.entries = g.entries.filter((_, j) => j !== i)
          g.winners = [{ ...winner, drawnAt: Date.now() }, ...g.winners]
          return g
        })
        await update('raffleWins', (list) => [{ name: winnerName, prize: giveaway!.prize, at: Date.now() }, ...list].slice(0, 50))
        return json(200, { giveaway })
      }

      if (rest === 'update' || rest === 'remove' || rest === 'restore') {
        const giveaway = await update('giveaway', (g) => {
          if (!g) throw new InputError('Start a giveaway first.')
          if (rest === 'update') {
            if ('prize' in body) g.prize = text(body.prize, 'Prize', 60)
            if ('keyword' in body) g.keyword = keyword(body.keyword)
            if ('minPoints' in body) g.minPoints = Math.round(money(body.minPoints, 'Minimum King Points', 100_000_000))
            if ('open' in body) g.open = Boolean(body.open)
          } else {
            const kickId = String(body.kickId ?? '')
            const [from, to] = rest === 'remove' ? (['entries', 'removed'] as const) : (['removed', 'entries'] as const)
            const entry = g[from].find((e) => e.kickId === kickId)
            if (entry) {
              g[from] = g[from].filter((e) => e.kickId !== kickId)
              g[to] = [...g[to], entry]
            }
          }
          return g
        })
        return json(200, { giveaway })
      }
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
