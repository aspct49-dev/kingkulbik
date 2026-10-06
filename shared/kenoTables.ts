/*
 * Keno tables, shared by the game (src/) and the server that settles bets.
 * 40 tiles; the player picks 1–10, then 10 are drawn. Multipliers are Stake's
 * Keno tables; every table returns 98.7–99.1% before the site's house rules
 * scale it down (see shared/originals.ts).
 */

export const TILE_COUNT = 40
export const DRAW_COUNT = 10
export const MAX_PICKS = 10

export type Risk = 'classic' | 'low' | 'medium' | 'high'

export const RISKS: { id: Risk; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

/** PAYOUTS[risk][picks - 1][hits] → multiplier */
export const PAYOUTS: Record<Risk, number[][]> = {
  classic: [
    [0, 3.96],
    [0, 1.9, 4.5],
    [0, 1, 3.1, 10.4],
    [0, 0.8, 1.8, 5, 22.5],
    [0, 0.25, 1.4, 4.1, 16.5, 36],
    [0, 0, 1, 3.68, 7, 16.5, 40],
    [0, 0, 0.47, 3, 4.5, 14, 31, 60],
    [0, 0, 0, 2.2, 4, 13, 22, 55, 70],
    [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85],
    [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100],
  ],
  low: [
    [0.7, 1.85],
    [0, 2, 3.8],
    [0, 1.1, 1.38, 26],
    [0, 0, 2.2, 7.9, 90],
    [0, 0, 1.5, 4.2, 13, 300],
    [0, 0, 1.1, 2, 6.2, 100, 700],
    [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  ],
  medium: [
    [0.4, 2.75],
    [0, 1.8, 5.1],
    [0, 0, 2.8, 50],
    [0, 0, 1.7, 10, 100],
    [0, 0, 1.4, 4, 14, 390],
    [0, 0, 0, 3, 9, 180, 710],
    [0, 0, 0, 2, 7, 30, 400, 800],
    [0, 0, 0, 2, 4, 11, 67, 400, 900],
    [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  ],
  high: [
    [0, 3.96],
    [0, 0, 17.1],
    [0, 0, 0, 81.5],
    [0, 0, 0, 10, 259],
    [0, 0, 0, 4.5, 48, 450],
    [0, 0, 0, 0, 11, 350, 710],
    [0, 0, 0, 0, 7, 90, 400, 800],
    [0, 0, 0, 0, 5, 20, 270, 600, 900],
    [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  ],
}

/** Base multipliers for 0…picks hits, or [] with no picks. */
export const getBasePayouts = (risk: Risk, picks: number) => (picks > 0 ? PAYOUTS[risk][picks - 1] : [])

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** Exact average return of a table, e.g. 0.9897 for Medium with 10 picks. */
export function getBaseReturn(risk: Risk, picks: number) {
  const misses = TILE_COUNT - DRAW_COUNT
  return getBasePayouts(risk, picks).reduce(
    (sum, multiplier, hits) =>
      sum + (multiplier * choose(DRAW_COUNT, hits) * choose(misses, picks - hits)) / choose(TILE_COUNT, picks),
    0,
  )
}
