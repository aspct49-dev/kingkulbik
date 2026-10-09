/*
 * House results for the originals: King Points wagered, paid out and kept by
 * the house, for the admin panel's charts.
 *
 * Kept as running totals per hour and game (houseStats), added to as each bet
 * settles: the bet history is capped, so it can't answer "all time" for long.
 * The first time they're read, they're filled from that history.
 *
 *   GET /api/admin/house?range=today|7d|30d|90d|all&game=all|keno|coinflip
 */

import type { GameId } from '../shared/originals.js'
import type { HouseGame, HouseHour, HouseRange, HouseStats, HouseTotals } from '../shared/house.js'
import { HOUSE_GAMES, HOUSE_RANGES, report } from '../shared/house.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { read, StoreError, update } from './store.js'

/** '2026-10-10T18': the UTC hour a bet settled in */
const hourKey = (at: number) => new Date(at).toISOString().slice(0, 13)
const cents = (n: number) => Math.round(n * 100) / 100
const empty = (): HouseTotals => ({ bets: 0, wagered: 0, paid: 0 })

function add(hours: Record<string, HouseHour>, game: GameId, bet: number, payout: number, at: number) {
  const key = hourKey(at)
  const hour = { ...hours[key] }
  const t = hour[game] ?? empty()
  hour[game] = { bets: t.bets + 1, wagered: cents(t.wagered + bet), paid: cents(t.paid + payout) }
  return { ...hours, [key]: hour }
}

/** A settled bet (server/profiles.ts records it after the bet history) */
export async function recordHouseBet(game: GameId, bet: number, payout: number, at: number) {
  // Not filled yet: the fill reads the bet history, which already has this bet
  await update('houseStats', (s) => (s.filled ? { ...s, hours: add(s.hours, game, bet, payout, at) } : s))
}

/** The totals, filled from the bet history the first time */
async function houseStats(): Promise<HouseStats> {
  const current = await read('houseStats')
  if (current.filled) return current
  const bets = await read('bets')
  return update('houseStats', (s) => {
    if (s.filled) return s
    let hours: Record<string, HouseHour> = {}
    for (const b of bets) hours = add(hours, b.game, b.bet, b.payout, b.at)
    return { filled: true, hours }
  })
}

export async function handleHouseRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/api/admin/house') return null
  if (!isAdmin(readSession(req, env), env)) return json(401, { error: 'Admins only.' })
  const range = url.searchParams.get('range') as HouseRange
  const game = (url.searchParams.get('game') ?? 'all') as HouseGame
  if (!HOUSE_RANGES.includes(range)) return json(400, { error: 'Pick a range: today, 7d, 30d, 90d or all.' })
  if (game !== 'all' && !HOUSE_GAMES.includes(game)) return json(400, { error: 'Pick a game.' })
  try {
    return json(200, { report: report(await houseStats(), range, game) })
  } catch (err) {
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
