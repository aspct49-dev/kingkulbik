/*
 * King Kulbik Originals on the server, played with King Points (BotRix).
 *
 * Every result is decided here from the provably fair seeds, under the house
 * rules, and every settled bet goes to the live feed and the player's history.
 *
 * Points: a bet is taken from the player's BotRix balance before the result
 * is drawn (BotRix refuses it if they're short), and a win is paid back to it.
 * A win is booked as owed and paid just after the result goes out, so the
 * player never waits on a second BotRix call; one BotRix can't pay then is
 * paid on the player's next request, so nothing is lost. BotRix points are whole numbers:
 * bets are whole points and wins are rounded down.
 *
 * State: each player's seed pair, bet counter and Coinflip game live in the
 * database, keyed by their Discord id, so no copy kept in the browser can
 * replay a bet or cash out a game twice. Every bet claims its nonce in one
 * atomic update before the result is worked out.
 *
 *   GET  /api/originals/rules
 *   GET  /api/originals/feed
 *   GET  /api/originals/fairness
 *   POST /api/originals/fairness/rotate   { clientSeed? }
 *   POST /api/originals/keno              { picks, risk, bet }
 *   POST /api/originals/coinflip          { action: 'start', bet } | { action: 'flip', side } | { action: 'cashout' } | { action: 'state' }
 */

import { randomBytes } from 'node:crypto'
import { RISKS, TILE_COUNT, MAX_PICKS } from '../shared/kenoTables.js'
import type { Risk } from '../shared/kenoTables.js'
import {
  cappedPayout,
  coinflipMultiplier,
  coinflipSide,
  kenoDraw,
  kenoPayouts,
  sha256Hex,
} from '../shared/originals.js'
import type { FairnessState, FeedBet, OwedPayout, PfState } from '../shared/originals.js'
import type { PointsLogEntry } from '../shared/profiles.js'
import { accountId, displayName } from './accounts.js'
import { json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse, SessionUser } from './auth.js'
import { adjustBotrixPoints, BotrixError } from './botrix.js'
import { recordPlayerBet } from './profiles.js'
import { read, StoreError, update } from './store.js'

const FEED_SIZE = 40
/** Matches the Coinflip page's ladder */
const MAX_STREAK = 20

type Player = SessionUser & { kick: { id: string; username: string } }

class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

// ---------------------------------------------------------------- state

const newSeed = () => randomBytes(32).toString('hex')
const newClientSeed = () => randomBytes(8).toString('hex')
const freshState = (): PfState => ({ serverSeed: newSeed(), clientSeed: newClientSeed(), nonce: 0, previous: null, coinflip: null })

/** Read-modify-write one player's state atomically; `fn` may throw to cancel */
async function withState<T>(userId: string, fn: (state: PfState) => T): Promise<{ result: T; state: PfState }> {
  let result!: T
  let state!: PfState
  await update('pfStates', (all) => {
    const s = all[userId] ?? freshState()
    result = fn(s)
    all[userId] = s
    state = s
    return all
  })
  return { result, state }
}

async function fairness(state: PfState): Promise<FairnessState> {
  return {
    serverSeedHash: await sha256Hex(state.serverSeed),
    clientSeed: state.clientSeed,
    nonce: state.nonce,
    previous: state.previous
      ? { ...state.previous, serverSeedHash: await sha256Hex(state.previous.serverSeed) }
      : null,
  }
}

// ---------------------------------------------------------------- points

async function logPoints(entry: Omit<PointsLogEntry, 'id' | 'at'>) {
  const row: PointsLogEntry = { ...entry, id: randomBytes(6).toString('hex'), at: Date.now() }
  await update('pointsLog', (list) => [row, ...list].slice(0, 2000)).catch(() => undefined)
}

/** Take a bet. Throws a GameError a player can read (short on points, BotRix down) */
async function takeBet(user: Player, bet: number, env: AuthEnv) {
  try {
    await adjustBotrixPoints(user.kick.username, -bet, env.BOTRIX_BID)
  } catch (err) {
    if (err instanceof BotrixError && err.code === 'insufficient') throw new GameError('Not enough King Points for this bet.', 402)
    if (err instanceof BotrixError && err.code === 'user_not_found') {
      throw new GameError('BotRix hasn’t seen your Kick name in chat yet, so you have no King Points to play with.', 402)
    }
    throw new GameError(err instanceof Error ? err.message : 'Could not take the bet. Please try again.', 502)
  }
}

/** Give a bet back when the game couldn't go ahead after it was taken */
async function returnBet(user: Player, bet: number, env: AuthEnv) {
  await adjustBotrixPoints(user.kick.username, bet, env.BOTRIX_BID).catch((err) =>
    logPoints({ kick: user.kick.username, delta: bet, kind: 'originals', reason: 'Bet returned', by: displayName(user), ok: false, error: err instanceof Error ? err.message : 'Failed' }),
  )
}

/** Work that carries on after the response is sent, so the player isn't kept waiting on it */
const later = (work: Promise<unknown>) => void work.catch(() => undefined)

/**
 * Pay one owed win: claimed first (so two requests can't pay it twice), put
 * back if BotRix fails. The first failure is logged; retries stay quiet.
 */
async function payOwed(o: OwedPayout, by: string, env: AuthEnv) {
  let claimed = false
  await update('owedPayouts', (list) => {
    claimed = list.some((x) => x.id === o.id)
    return list.filter((x) => x.id !== o.id)
  })
  if (!claimed) return
  try {
    await adjustBotrixPoints(o.kick, o.amount, env.BOTRIX_BID)
    if (o.attempts > 0) await logPoints({ kick: o.kick, delta: o.amount, kind: 'originals', reason: `${o.reason} (owed win paid)`, by, ok: true })
  } catch (err) {
    await update('owedPayouts', (list) => [...list, { ...o, attempts: o.attempts + 1 }])
    if (o.attempts === 0) {
      await logPoints({
        kick: o.kick,
        delta: o.amount,
        kind: 'originals',
        reason: `${o.reason} (owed, will retry)`,
        by,
        ok: false,
        error: err instanceof Error ? err.message : 'Payout failed',
      })
    }
  }
}

/**
 * Pay a win without holding up the result. It's booked as owed first, so it
 * can't be lost: paid straight after the response, or on the player's next
 * request if that didn't get through.
 */
async function payWin(user: Player, amount: number, reason: string, env: AuthEnv) {
  if (amount <= 0) return
  const owed: OwedPayout = { id: randomBytes(6).toString('hex'), userId: accountId(user), kick: user.kick.username, amount, reason, at: Date.now(), attempts: 0 }
  try {
    await update('owedPayouts', (list) => [...list, owed])
  } catch {
    // The store is down: pay it now instead
    await adjustBotrixPoints(user.kick.username, amount, env.BOTRIX_BID)
    return
  }
  later(payOwed(owed, displayName(user), env))
}

/** Pay anything still owed to this player */
async function settleOwed(user: Player, env: AuthEnv) {
  const mine = (await read('owedPayouts')).filter((o) => o.userId === accountId(user))
  for (const o of mine) await payOwed(o, displayName(user), env).catch(() => undefined)
}

// ---------------------------------------------------------------- helpers

function parseBody<T>(body: string | undefined): T | null {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return null
  }
}

async function recordFeed(bet: Omit<FeedBet, 'id' | 'at'>) {
  const entry: FeedBet = { ...bet, id: randomBytes(6).toString('hex'), at: Date.now() }
  // The feed is best effort: a busy or read-only store still settles the bet
  await update('feed', (feed) => [entry, ...feed].slice(0, FEED_SIZE)).catch(() => undefined)
}

/** Whole points between the game's limits */
function wholeBet(raw: unknown, min: number, max: number) {
  const bet = Number(raw)
  if (!Number.isInteger(bet)) throw new GameError('Bets are whole King Points.')
  if (!(bet >= min && bet <= max)) {
    throw new GameError(`Bets are ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')} King Points.`)
  }
  return bet
}

/** A win in whole points, capped at the game's max win */
const winOf = (bet: number, multiplier: number, maxWin: number) => Math.floor(cappedPayout(bet, multiplier, maxWin))

// ---------------------------------------------------------------- handler

export async function handleOriginalsRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/originals/')) return null
  const route = url.pathname.slice('/api/originals/'.length)

  try {
    if (route === 'rules') return json(200, { rules: await read('rules') })
    if (route === 'feed') return json(200, { bets: await read('feed') })

    // Everything else is a player's own game: signed in, with Kick (where King Points live)
    const session = readSession(req, env)
    if (!session) throw new GameError('Sign in with Discord to play.', 401)
    if (!session.kick) throw new GameError('Link your Kick account to play with King Points.', 403)
    const user = session as Player
    const player = displayName(user)

    const [rules] = await Promise.all([read('rules'), settleOwed(user, env)])

    if (route === 'fairness') {
      const { state } = await withState(accountId(user), () => undefined)
      return json(200, { fairness: await fairness(state) })
    }

    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

    if (route === 'fairness/rotate') {
      const body = parseBody<{ clientSeed?: string }>(req.body)
      const requested = String(body?.clientSeed ?? '').trim()
      if (requested && !/^[\w-]{1,32}$/.test(requested)) throw new GameError('Client seed: up to 32 letters, numbers, - or _.')
      const { state } = await withState(accountId(user), (s) => {
        if (s.coinflip) throw new GameError('Finish your Coinflip game before changing seeds.', 409)
        s.previous = { serverSeed: s.serverSeed, clientSeed: s.clientSeed, nonce: s.nonce }
        s.serverSeed = newSeed()
        s.clientSeed = requested || newClientSeed()
        s.nonce = 0
      })
      return json(200, { fairness: await fairness(state) })
    }

    // ---- Keno: one request settles the round
    if (route === 'keno') {
      const r = rules.keno
      if (!r.enabled) throw new GameError('Keno is closed right now.', 403)
      const body = parseBody<{ picks?: unknown; risk?: unknown; bet?: unknown }>(req.body)
      const picks = Array.isArray(body?.picks) ? [...new Set(body.picks.map(Number))] : []
      const risk = String(body?.risk) as Risk
      if (!picks.length || picks.length > MAX_PICKS || picks.some((t) => !Number.isInteger(t) || t < 1 || t > TILE_COUNT)) {
        throw new GameError(`Pick 1 to ${MAX_PICKS} tiles.`)
      }
      if (!RISKS.some((x) => x.id === risk)) throw new GameError('Unknown difficulty.')
      const bet = wholeBet(body?.bet, r.minBet, r.maxBet)

      await takeBet(user, bet, env)
      // Claim the nonce (and the seeds it's drawn with) before working out the result
      let claim: { serverSeed: string; clientSeed: string; nonce: number }
      let state: PfState
      try {
        ;({ result: claim, state } = await withState(accountId(user), (s) => ({ serverSeed: s.serverSeed, clientSeed: s.clientSeed, nonce: s.nonce++ })))
      } catch (err) {
        await returnBet(user, bet, env)
        throw err
      }
      const drawn = await kenoDraw(claim.serverSeed, claim.clientSeed, claim.nonce)
      const hits = picks.filter((t) => drawn.includes(t)).length
      const multiplier = kenoPayouts(risk, picks.length, r.houseEdge)[hits] ?? 0
      const payout = winOf(bet, multiplier, r.maxWin)
      await payWin(user, payout, `Keno win (${multiplier}×)`, env)

      // The live feed and bet history don't hold up the result
      later(recordFeed({ game: 'keno', player, bet, multiplier, payout }))
      later(
        sha256Hex(claim.serverSeed).then((serverSeedHash) =>
          recordPlayerBet(user, {
            game: 'keno',
            bet,
            multiplier,
            payout,
            serverSeedHash,
            clientSeed: claim.clientSeed,
            nonces: [claim.nonce],
            detail: { picks, drawn, risk },
          }),
        ),
      )
      return json(200, { drawn, hits, multiplier, payout, nonce: claim.nonce, fairness: await fairness(state) })
    }

    // ---- Coinflip: a game is several requests (start, flips, cash out)
    if (route === 'coinflip') {
      const r = rules.coinflip
      const body = parseBody<{ action?: string; bet?: unknown; side?: unknown }>(req.body)
      const action = body?.action

      if (action === 'state') {
        const { state } = await withState(accountId(user), () => undefined)
        return json(200, { game: state.coinflip })
      }

      if (action === 'start') {
        if (!r.enabled) throw new GameError('Coinflip is closed right now.', 403)
        const bet = wholeBet(body?.bet, r.minBet, r.maxBet)
        const current = (await read('pfStates'))[accountId(user)]
        if (current?.coinflip) throw new GameError('You already have a game in progress.', 409, { game: current.coinflip })
        await takeBet(user, bet, env)
        try {
          const { result: game } = await withState(accountId(user), (s) => {
            if (s.coinflip) throw new GameError('You already have a game in progress.', 409, { game: s.coinflip })
            s.coinflip = { id: randomBytes(8).toString('hex'), bet, streak: 0, calls: [], results: [], nonces: [] }
            return s.coinflip
          })
          return json(200, { game })
        } catch (err) {
          // The game didn't start: the bet goes back
          await returnBet(user, bet, env)
          throw err
        }
      }

      /** End the game (only if it's still the one we think) and pay what it won */
      const settle = async (gameId: string, multiplier: number, final: { calls: string[]; results: string[]; nonces: number[] }) => {
        const { result: game, state } = await withState(accountId(user), (s) => {
          if (!s.coinflip || s.coinflip.id !== gameId) throw new GameError('That game is already over.', 409)
          const g = s.coinflip
          s.coinflip = null
          return g
        })
        const payout = multiplier > 0 ? winOf(game.bet, multiplier, r.maxWin) : 0
        await payWin(user, payout, `Coinflip win (${multiplier}×)`, env)
        later(recordFeed({ game: 'coinflip', player, bet: game.bet, multiplier, payout }))
        later(
          sha256Hex(state.serverSeed).then((serverSeedHash) =>
            recordPlayerBet(user, {
              game: 'coinflip',
              bet: game.bet,
              multiplier,
              payout,
              serverSeedHash,
              clientSeed: state.clientSeed,
              nonces: final.nonces,
              detail: { calls: final.calls, results: final.results },
            }),
          ),
        )
        return { payout, state }
      }

      if (action === 'flip') {
        const side = body?.side
        if (side !== 'heads' && side !== 'tails') throw new GameError('Call heads or tails.')
        // Claim this flip's nonce on the game as it stands
        const { result: claim } = await withState(accountId(user), (s) => {
          if (!s.coinflip) throw new GameError('Start a game first.', 409)
          return { game: { ...s.coinflip }, serverSeed: s.serverSeed, clientSeed: s.clientSeed, nonce: s.nonce++ }
        })
        const result = await coinflipSide(claim.serverSeed, claim.clientSeed, claim.nonce)
        const history = {
          calls: [...claim.game.calls, side],
          results: [...claim.game.results, result],
          nonces: [...claim.game.nonces, claim.nonce],
        }

        if (result !== side) {
          const { state } = await settle(claim.game.id, 0, history)
          return json(200, { result, won: false, streak: claim.game.streak, payout: 0, nonce: claim.nonce, fairness: await fairness(state) })
        }

        const streak = claim.game.streak + 1
        const multiplier = coinflipMultiplier(streak, r.houseEdge)
        // Record the win on the game (if it's still this game at this streak)
        const { state } = await withState(accountId(user), (s) => {
          const g = s.coinflip
          if (!g || g.id !== claim.game.id || g.streak !== claim.game.streak) throw new GameError('That game moved on. Refresh to continue.', 409)
          Object.assign(g, { streak }, history)
        })
        // At the streak limit or the max win, the game cashes out by itself
        if (streak >= MAX_STREAK || winOf(claim.game.bet, multiplier, r.maxWin) >= r.maxWin) {
          const done = await settle(claim.game.id, multiplier, history)
          return json(200, { result, won: true, streak, multiplier, payout: done.payout, cashedOut: true, nonce: claim.nonce, fairness: await fairness(done.state) })
        }
        return json(200, { result, won: true, streak, multiplier, nonce: claim.nonce, fairness: await fairness(state) })
      }

      if (action === 'cashout') {
        const current = (await read('pfStates'))[accountId(user)]?.coinflip
        if (!current) throw new GameError('Start a game first.', 409)
        if (current.streak < 1) throw new GameError('Win a call before cashing out.')
        const multiplier = coinflipMultiplier(current.streak, r.houseEdge)
        const done = await settle(current.id, multiplier, current)
        return json(200, { payout: done.payout, multiplier, fairness: await fairness(done.state) })
      }

      throw new GameError('Unknown action.')
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof GameError) return json(err.status, { error: err.message, ...err.extra })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
