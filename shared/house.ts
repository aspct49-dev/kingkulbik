/*
 * House results for the originals (server/house.ts → the admin's House tab):
 * King Points wagered, paid out, and what the house kept, over a timeframe.
 * The totals are kept per UTC hour and game; report() groups them for a range.
 */

import type { GameId } from './originals.js'

export const HOUSE_RANGES = ['today', '7d', '30d', '90d', 'all'] as const
export type HouseRange = (typeof HOUSE_RANGES)[number]

export const HOUSE_GAMES: GameId[] = ['keno', 'coinflip']
export type HouseGame = GameId | 'all'

export type HouseTotals = { bets: number; wagered: number; paid: number }

/** One bar of the chart: an hour (today), a day, or a week (a long "all time") */
export type HouseBucket = HouseTotals & {
  /** UTC start (ms) */
  start: number
  /** Wagered − paid: positive, the house kept points; negative, players won them */
  profit: number
}

export type HouseReport = {
  range: HouseRange
  game: HouseGame
  step: 'hour' | 'day' | 'week'
  from: number
  to: number
  /** The first hour with a bet (null: none yet) */
  earliest: number | null
  /** For the chosen game (or all) over the range */
  totals: HouseTotals & { profit: number }
  /** Each game over the range, whichever is chosen */
  byGame: Record<GameId, HouseTotals>
  buckets: HouseBucket[]
}

/** One UTC hour's totals per game */
export type HouseHour = Partial<Record<GameId, HouseTotals>>
/** Stored by the server: every hour with a bet ('2026-10-10T18' → totals); filled once from the bet history */
export type HouseStats = { filled: boolean; hours: Record<string, HouseHour> }

const HOUR = 3600_000
const DAY = 24 * HOUR
/** Longer than this, "all time" goes week by week */
const DAILY_UP_TO_DAYS = 120

const hourStart = (key: string) => Date.parse(`${key}:00:00Z`)
const cents = (n: number) => Math.round(n * 100) / 100
const empty = (): HouseTotals => ({ bets: 0, wagered: 0, paid: 0 })

/** Where a range starts, and how it's split */
function span(range: HouseRange, earliest: number | null, now: number) {
  const today = Math.floor(now / DAY) * DAY
  if (range === 'today') return { from: today, step: 'hour' as const }
  if (range !== 'all') return { from: today - (Number.parseInt(range, 10) - 1) * DAY, step: 'day' as const }
  const first = Math.floor((earliest ?? now) / DAY) * DAY
  if ((today - first) / DAY < DAILY_UP_TO_DAYS) return { from: first, step: 'day' as const }
  // Weeks start on Monday (UTC); 1970-01-01 was a Thursday
  const monday = first - (((Math.floor(first / DAY) + 3) % 7) * DAY)
  return { from: monday, step: 'week' as const }
}

export function report(stats: HouseStats, range: HouseRange, game: HouseGame, now = Date.now()): HouseReport {
  const keys = Object.keys(stats.hours).sort()
  const earliest = keys.length ? hourStart(keys[0]) : null
  const { from, step } = span(range, earliest, now)
  const size = step === 'hour' ? HOUR : step === 'day' ? DAY : 7 * DAY
  const count = Math.max(1, Math.floor((now - from) / size) + 1)
  const buckets: HouseBucket[] = Array.from({ length: count }, (_, i) => ({ start: from + i * size, ...empty(), profit: 0 }))
  const totals = empty()
  const byGame = Object.fromEntries(HOUSE_GAMES.map((g) => [g, empty()])) as Record<GameId, HouseTotals>

  for (const key of keys) {
    const at = hourStart(key)
    if (at < from) continue
    const bucket = buckets[Math.min(count - 1, Math.floor((at - from) / size))]
    for (const g of HOUSE_GAMES) {
      const t = stats.hours[key][g]
      if (!t) continue
      const into = [byGame[g]]
      if (game === 'all' || game === g) into.push(totals, bucket)
      for (const x of into) {
        x.bets += t.bets
        x.wagered = cents(x.wagered + t.wagered)
        x.paid = cents(x.paid + t.paid)
      }
    }
  }
  for (const b of buckets) b.profit = cents(b.wagered - b.paid)
  return { range, game, step, from, to: now, earliest, totals: { ...totals, profit: cents(totals.wagered - totals.paid) }, byGame, buckets }
}

