/*
 * Leaderboard rules shared by the API proxy (server/) and the page (src/).
 * Plain TypeScript with no Node or DOM dependencies, so both sides can import it.
 *
 * Mirrors the live race on kingkulbik.com/leaderboards: two boards under code
 * KINGKULBIK ($30,000 weighted + $10,000 Stake-exclusive a month), each race running from the 29th
 * through the 28th (UTC).
 */

export type BoardId = 'weighted' | 'exclusive'

export type BoardConfig = {
  id: BoardId
  label: string
  /** Sent to Stake as isStakeExclusive. */
  stakeExclusive: boolean
  /** Prize per place, 1st first. Its length is the number of paid places. */
  prizes: number[]
}

export const BOARDS: Record<BoardId, BoardConfig> = {
  weighted: {
    id: 'weighted',
    label: 'Weighted Wager Race',
    stakeExclusive: false,
    prizes: [12500, 7500, 5000, 1800, 1000, 650, 450, 300, 200, 100, 100, 100, 100, 100, 100],
  },
  exclusive: {
    id: 'exclusive',
    label: 'Stake Exclusive',
    stakeExclusive: true,
    prizes: [3500, 1900, 1200, 800, 650, 500, 400, 350, 350, 350],
  },
}

export const isBoardId = (value: unknown): value is BoardId =>
  value === 'weighted' || value === 'exclusive'

/** Day of the month each race starts on, at 00:00 UTC. */
export const RACE_START_DAY = 29

/**
 * The race containing `now`: [start, end) in epoch ms, UTC.
 * A start day past the end of a short month rolls into the next month
 * (Feb 29 in a non-leap year becomes Mar 1), which keeps "through the 28th".
 */
export function getRaceWindow(now = Date.now()) {
  const d = new Date(now)
  const startOf = (year: number, month: number) => Date.UTC(year, month, RACE_START_DAY)

  let start = startOf(d.getUTCFullYear(), d.getUTCMonth())
  if (start > now) start = startOf(d.getUTCFullYear(), d.getUTCMonth() - 1)
  const s = new Date(start)
  const end = startOf(s.getUTCFullYear(), s.getUTCMonth() + 1)
  return { start, end }
}

export type LeaderboardEntry = {
  rank: number
  /** Masked by the server; full usernames never reach the browser. */
  name: string
  wagered: number
  weighted: number
  prize: number
}

export type LeaderboardResponse = {
  board: BoardId
  window: { start: number; end: number }
  entries: LeaderboardEntry[]
  updatedAt: number
}
