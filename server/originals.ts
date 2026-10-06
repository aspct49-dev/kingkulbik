/*
 * King Kulbik Originals on the server: every result is decided here from the
 * provably fair seeds, under the house rules, and every settled bet goes to
 * the live feed.
 *
 * The seed pair, the nonce and any Coinflip game in progress live in an
 * encrypted cookie (AES-256-GCM, key derived from SESSION_SECRET): the player
 * holds it but can't read the server seed or change anything in it. Guests
 * get one too, so the games work signed out.
 *
 * A cookie can be saved and put back, which would replay a bet whose result
 * is already known. The server remembers the next nonce of every seed it has
 * seen and refuses anything older. That memory lives in this process, so it
 * fully covers one server (local, a VPS); on serverless it moves to the
 * database together with the balances.
 *
 * Balances are still the demo points in the browser: King Points live in
 * BotRix, and changing them needs the BotRix management API. When that lands,
 * the server deducts the bet and credits the payout here.
 *
 *   GET  /api/originals/rules
 *   GET  /api/originals/fairness
 *   POST /api/originals/fairness/rotate   { clientSeed? }
 *   POST /api/originals/keno              { picks, risk, bet }
 *   POST /api/originals/coinflip          { action: 'start', bet } | { action: 'flip', side } | { action: 'cashout' } | { action: 'state' }
 *   GET  /api/originals/feed
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
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
import type { FairnessState, FeedBet, GameId } from '../shared/originals.js'
import { cookie, json, origin, parseCookies, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { recordPlayerBet } from './profiles.js'
import { read, update } from './store.js'

const PF_COOKIE = 'kk_pf'
const FEED_SIZE = 40
/** Matches the Coinflip page's ladder */
const MAX_STREAK = 20

type PfState = {
  serverSeed: string
  clientSeed: string
  nonce: number
  previous: { serverSeed: string; clientSeed: string; nonce: number } | null
  coinflip: { id: string; bet: number; streak: number; calls: string[]; results: string[]; nonces: number[] } | null
}

// ---------------------------------------------------------------- the cookie

const keyFor = (secret: string) => createHash('sha256').update(`${secret}:provably-fair`).digest()

function encrypt(state: PfState, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

function decrypt(token: string | undefined, secret: string): PfState | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    return JSON.parse(text) as PfState
  } catch {
    return null
  }
}

const newSeed = () => randomBytes(32).toString('hex')
const newClientSeed = () => randomBytes(8).toString('hex')

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

// ---------------------------------------------------------------- helpers

/** Next allowed nonce per server seed (bounded; oldest seeds drop out first) */
const nextNonce = new Map<string, number>()
const NONCE_MEMORY = 50_000

function claimNonce(state: PfState) {
  const seen = nextNonce.get(state.serverSeed) ?? 0
  // An old copy of the cookie: its nonce was already played. Move it on to
  // the next unplayed nonce (its result is unknown, so nothing is gained)
  if (state.nonce < seen) {
    state.nonce = seen
    return false
  }
  nextNonce.delete(state.serverSeed)
  nextNonce.set(state.serverSeed, state.nonce + 1)
  if (nextNonce.size > NONCE_MEMORY) nextNonce.delete(nextNonce.keys().next().value as string)
  return true
}

/** Coinflip games already settled (a restored cookie can't cash one out twice) */
const settledGames = new Set<string>()

function markSettled(id: string) {
  settledGames.add(id)
  if (settledGames.size > NONCE_MEMORY) settledGames.delete(settledGames.values().next().value as string)
}

const REPLAYED = 'That bet was already played. Please try again.'

function parseBody<T>(body: string | undefined): T | null {
  try {
    return JSON.parse(body || '{}') as T
  } catch {
    return null
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

async function recordBet(bet: Omit<FeedBet, 'id' | 'at'>) {
  const entry: FeedBet = { ...bet, id: randomBytes(6).toString('hex'), at: Date.now() }
  // The feed is best effort: a read-only host still settles the bet
  await update('feed', (feed) => [entry, ...feed].slice(0, FEED_SIZE)).catch(() => undefined)
}

// ---------------------------------------------------------------- handler

export async function handleOriginalsRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/originals/')) return null
  const route = url.pathname.slice('/api/originals/'.length)

  if (route === 'rules') return json(200, { rules: await read('rules') })
  if (route === 'feed') return json(200, { bets: await read('feed') })

  const secret = env.SESSION_SECRET
  if (!secret || secret.length < 32) return json(500, { error: 'Games are not configured (SESSION_SECRET).' })
  const secure = origin(req, env).startsWith('https://')

  let state = decrypt(parseCookies(req.cookie)[PF_COOKIE], secret)
  if (!state) state = { serverSeed: newSeed(), clientSeed: newClientSeed(), nonce: 0, previous: null, coinflip: null }
  const save = () => cookie(PF_COOKIE, encrypt(state!, secret), 365 * 86400, secure)

  const user = readSession(req, env)
  const player = user?.discord.name ?? 'Guest'

  if (route === 'fairness') return json(200, { fairness: await fairness(state) }, [save()])

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const rules = await read('rules')

  if (route === 'fairness/rotate') {
    if (state.coinflip) return json(409, { error: 'Finish your Coinflip game before changing seeds.' })
    const body = parseBody<{ clientSeed?: string }>(req.body)
    const requested = String(body?.clientSeed ?? '').trim()
    if (requested && !/^[\w-]{1,32}$/.test(requested)) {
      return json(400, { error: 'Client seed: up to 32 letters, numbers, - or _.' })
    }
    state = {
      serverSeed: newSeed(),
      clientSeed: requested || newClientSeed(),
      nonce: 0,
      previous: { serverSeed: state.serverSeed, clientSeed: state.clientSeed, nonce: state.nonce },
      coinflip: null,
    }
    return json(200, { fairness: await fairness(state) }, [save()])
  }

  // ---- Keno: one request settles the round
  if (route === 'keno') {
    const r = rules.keno
    if (!r.enabled) return json(403, { error: 'Keno is closed right now.' })
    const body = parseBody<{ picks?: unknown; risk?: unknown; bet?: unknown }>(req.body)
    const picks = Array.isArray(body?.picks) ? [...new Set(body.picks.map(Number))] : []
    const risk = String(body?.risk) as Risk
    const bet = round2(Number(body?.bet))
    if (!picks.length || picks.length > MAX_PICKS || picks.some((t) => !Number.isInteger(t) || t < 1 || t > TILE_COUNT)) {
      return json(400, { error: `Pick 1 to ${MAX_PICKS} tiles.` })
    }
    if (!RISKS.some((x) => x.id === risk)) return json(400, { error: 'Unknown difficulty.' })
    if (!(bet >= r.minBet && bet <= r.maxBet)) return json(400, { error: `Bets are ${r.minBet} to ${r.maxBet} points.` })

    if (!claimNonce(state)) return json(409, { error: REPLAYED, fairness: await fairness(state) }, [save()])
    const nonce = state.nonce++
    const drawn = await kenoDraw(state.serverSeed, state.clientSeed, nonce)
    const hits = picks.filter((t) => drawn.includes(t)).length
    const multiplier = kenoPayouts(risk, picks.length, r.houseEdge)[hits] ?? 0
    const payout = cappedPayout(bet, multiplier, r.maxWin)
    await recordBet({ game: 'keno', player, bet, multiplier, payout })
    if (user) {
      await recordPlayerBet(user, {
        game: 'keno',
        bet,
        multiplier,
        payout,
        serverSeedHash: await sha256Hex(state.serverSeed),
        clientSeed: state.clientSeed,
        nonces: [nonce],
        detail: { picks, drawn, risk },
      })
    }
    return json(200, { drawn, hits, multiplier, payout, nonce, fairness: await fairness(state) }, [save()])
  }

  // ---- Coinflip: a game is several requests (start, flips, cash out)
  if (route === 'coinflip') {
    const r = rules.coinflip
    const body = parseBody<{ action?: string; bet?: unknown; side?: unknown }>(req.body)
    const action = body?.action

    if (action === 'start') {
      if (!r.enabled) return json(403, { error: 'Coinflip is closed right now.' })
      if (state.coinflip) return json(409, { error: 'You already have a game in progress.', game: state.coinflip })
      const bet = round2(Number(body?.bet))
      if (!(bet >= r.minBet && bet <= r.maxBet)) return json(400, { error: `Bets are ${r.minBet} to ${r.maxBet} points.` })
      state.coinflip = { id: randomBytes(8).toString('hex'), bet, streak: 0, calls: [], results: [], nonces: [] }
      return json(200, { game: state.coinflip }, [save()])
    }

    // A game survives a reload: the page asks for it on load
    if (action === 'state') return json(200, { game: state.coinflip }, [save()])

    const game = state.coinflip
    if (!game) return json(409, { error: 'Start a game first.' })
    if (!game.id || settledGames.has(game.id)) {
      state.coinflip = null
      return json(409, { error: REPLAYED }, [save()])
    }

    const settle = async (payout: number, multiplier: number) => {
      state!.coinflip = null
      markSettled(game.id)
      await recordBet({ game: 'coinflip' as GameId, player, bet: game.bet, multiplier, payout })
      if (user) {
        await recordPlayerBet(user, {
          game: 'coinflip',
          bet: game.bet,
          multiplier,
          payout,
          serverSeedHash: await sha256Hex(state!.serverSeed),
          clientSeed: state!.clientSeed,
          nonces: game.nonces ?? [],
          detail: { calls: game.calls ?? [], results: game.results ?? [] },
        })
      }
    }

    if (action === 'flip') {
      const side = body?.side
      if (side !== 'heads' && side !== 'tails') return json(400, { error: 'Call heads or tails.' })
      if (!claimNonce(state)) {
        state.coinflip = null
        return json(409, { error: REPLAYED, fairness: await fairness(state) }, [save()])
      }
      const nonce = state.nonce++
      const result = await coinflipSide(state.serverSeed, state.clientSeed, nonce)
      game.calls = [...(game.calls ?? []), side]
      game.results = [...(game.results ?? []), result]
      game.nonces = [...(game.nonces ?? []), nonce]
      if (result !== side) {
        await settle(0, 0)
        return json(200, { result, won: false, streak: game.streak, payout: 0, nonce, fairness: await fairness(state) }, [save()])
      }
      game.streak += 1
      const multiplier = coinflipMultiplier(game.streak, r.houseEdge)
      const reachedCap = cappedPayout(game.bet, multiplier, r.maxWin) >= r.maxWin
      // At the streak limit or the max win, the game cashes out by itself
      if (game.streak >= MAX_STREAK || reachedCap) {
        const payout = cappedPayout(game.bet, multiplier, r.maxWin)
        await settle(payout, multiplier)
        return json(200, { result, won: true, streak: game.streak, multiplier, payout, cashedOut: true, nonce, fairness: await fairness(state) }, [save()])
      }
      return json(200, { result, won: true, streak: game.streak, multiplier, nonce, fairness: await fairness(state) }, [save()])
    }

    if (action === 'cashout') {
      if (game.streak < 1) return json(400, { error: 'Win a call before cashing out.' })
      const multiplier = coinflipMultiplier(game.streak, r.houseEdge)
      const payout = cappedPayout(game.bet, multiplier, r.maxWin)
      await settle(payout, multiplier)
      return json(200, { payout, multiplier, fairness: await fairness(state) }, [save()])
    }

    return json(400, { error: 'Unknown action.' })
  }

  return json(404, { error: 'Not found.' })
}
