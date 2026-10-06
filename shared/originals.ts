/*
 * King Kulbik Originals: house rules and provably fair results.
 *
 * Shared by the server (which settles every bet) and the browser (which shows
 * the rules and lets players verify past bets with the revealed seeds).
 *
 * House rules
 *   The originals are a side game, not a way to farm King Points for the
 *   store, so the edge is high and every bet and win is capped. All of it is
 *   editable in the admin panel; these are the defaults.
 *
 * Provably fair (the same scheme Stake uses)
 *   Before you bet, the server commits to a secret server seed by showing its
 *   SHA-256 hash. Each bet's randomness is
 *     HMAC-SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${round}`)
 *   read four bytes at a time as floats in [0, 1). You choose the client seed;
 *   the nonce counts your bets. Rotating the seed reveals the old server seed,
 *   so every past result can be recomputed and checked against its hash.
 */

import { DRAW_COUNT, TILE_COUNT, getBasePayouts, getBaseReturn } from './kenoTables.js'
import type { Risk } from './kenoTables.js'

export type GameId = 'keno' | 'coinflip'

export type GameRules = {
  enabled: boolean
  /** 0.15 = the house keeps 15% of what's wagered on average */
  houseEdge: number
  minBet: number
  maxBet: number
  /** Largest payout of a single bet (or a Coinflip game) */
  maxWin: number
}

export type OriginalsRules = Record<GameId, GameRules>

export const DEFAULT_RULES: OriginalsRules = {
  keno: { enabled: true, houseEdge: 0.15, minBet: 1, maxBet: 100, maxWin: 2500 },
  coinflip: { enabled: true, houseEdge: 0.15, minBet: 1, maxBet: 100, maxWin: 2500 },
}

/** Keep admin input inside sane bounds */
export function sanitizeRules(input: Partial<Record<GameId, Partial<GameRules>>> | undefined): OriginalsRules {
  const clean = (game: GameId): GameRules => {
    const d = DEFAULT_RULES[game]
    const r = { ...d, ...(input?.[game] ?? {}) }
    const num = (v: unknown, fallback: number, min: number, max: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
    }
    const minBet = num(r.minBet, d.minBet, 0.01, 1_000_000)
    const maxBet = Math.max(minBet, num(r.maxBet, d.maxBet, 0.01, 1_000_000))
    return {
      enabled: Boolean(r.enabled),
      houseEdge: Math.round(num(r.houseEdge, d.houseEdge, 0.01, 0.6) * 1000) / 1000,
      minBet,
      maxBet,
      maxWin: Math.max(maxBet, num(r.maxWin, d.maxWin, 0.01, 100_000_000)),
    }
  }
  return { keno: clean('keno'), coinflip: clean('coinflip') }
}

const floor2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100

/** Keno multipliers for 0…picks hits, scaled so the table returns (1 - edge) */
export function kenoPayouts(risk: Risk, picks: number, houseEdge: number): number[] {
  const base = getBasePayouts(risk, picks)
  if (!base.length) return []
  const scale = (1 - houseEdge) / getBaseReturn(risk, picks)
  return base.map((m) => (m > 0 ? floor2(m * scale) : 0))
}

/** Coinflip multiplier after `streak` correct calls: (1 - edge) × 2ⁿ */
export const coinflipMultiplier = (streak: number, houseEdge: number) =>
  streak <= 0 ? 0 : floor2((1 - houseEdge) * 2 ** streak)

/** Payout of a bet, capped at the game's max win */
export const cappedPayout = (bet: number, multiplier: number, maxWin: number) =>
  Math.min(maxWin, floor2(bet * multiplier))

// ------------------------------------------------------------ provably fair

const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

/** `count` floats in [0, 1) for one bet */
export async function fairFloats(serverSeed: string, clientSeed: string, nonce: number, count: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const floats: number[] = []
  for (let round = 0; floats.length < count; round++) {
    const bytes = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(`${clientSeed}:${nonce}:${round}`)),
    )
    for (let i = 0; i + 4 <= bytes.length && floats.length < count; i += 4) {
      floats.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return floats
}

/** Keno: 10 distinct tiles (1–40) by a Fisher–Yates draw, in draw order */
export async function kenoDraw(serverSeed: string, clientSeed: string, nonce: number) {
  const floats = await fairFloats(serverSeed, clientSeed, nonce, DRAW_COUNT)
  const tiles = Array.from({ length: TILE_COUNT }, (_, i) => i + 1)
  const drawn: number[] = []
  floats.forEach((f) => {
    const index = Math.floor(f * tiles.length)
    drawn.push(tiles.splice(index, 1)[0])
  })
  return drawn
}

/** Coinflip: below 0.5 is heads */
export async function coinflipSide(serverSeed: string, clientSeed: string, nonce: number) {
  const [f] = await fairFloats(serverSeed, clientSeed, nonce, 1)
  return f < 0.5 ? ('heads' as const) : ('tails' as const)
}

// ------------------------------------------------------------ shared shapes

export type FairnessState = {
  serverSeedHash: string
  clientSeed: string
  /** Bets made with this seed pair so far (the next bet uses this number) */
  nonce: number
  /** The last pair, revealed when the seed was rotated */
  previous: { serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number } | null
}

export type FeedBet = {
  id: string
  game: GameId
  player: string
  bet: number
  multiplier: number
  payout: number
  at: number
}
