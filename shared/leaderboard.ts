/*
 * Leaderboard rules shared by the API proxy (server/) and the page (src/).
 * Plain TypeScript with no Node or DOM dependencies, so both sides can import it.
 *
 * Two boards under code KINGKULBIK. Races run a calendar month in whole UTC
 * days (Stake counts whole days: a window touching a day takes all of it):
 * from 28 Oct 2026, the 28th through the 27th; before that, the 29th through
 * the 28th. The switch means 28 Oct counts in both October's race (as paid)
 * and the one that began that day. Prizes change over time (PRIZE_HISTORY): from the race that
 * began 29 Oct 2026, $40,000 on the Stake race and $20,000 Only on Stake;
 * before it, $30,000 and $10,000. Finished races are kept (ArchivedRace).
 */

export type BoardId = 'weighted' | 'exclusive'

export type BoardConfig = {
  id: BoardId
  label: string
  /** Sent to Stake as isStakeExclusive. */
  stakeExclusive: boolean
}

export const BOARDS: Record<BoardId, BoardConfig> = {
  weighted: { id: 'weighted', label: 'Weighted Wager Race', stakeExclusive: false },
  exclusive: { id: 'exclusive', label: 'Stake Exclusive', stakeExclusive: true },
}

/**
 * Prize per place (1st first; the length is the number of paid places), by
 * the race they apply from. A race uses the newest set that began on or
 * before its start, so changing prizes never rewrites a finished race.
 */
const PRIZE_HISTORY: { from: number; prizes: Record<BoardId, number[]> }[] = [
  {
    // $40,000 + $20,000 (Only on Stake: every place doubled)
    from: Date.UTC(2026, 9, 28),
    prizes: {
      weighted: [16500, 10000, 6500, 2500, 1400, 900, 600, 400, 300, 150, 150, 150, 150, 150, 150],
      exclusive: [7000, 3800, 2400, 1600, 1300, 1000, 800, 700, 700, 700],
    },
  },
  {
    // $30,000 + $10,000
    from: 0,
    prizes: {
      weighted: [12500, 7500, 5000, 1800, 1000, 650, 450, 300, 200, 100, 100, 100, 100, 100, 100],
      exclusive: [3500, 1900, 1200, 800, 650, 500, 400, 350, 350, 350],
    },
  },
]

/** The prizes of the race that starts at `raceStart` (defaults to the current race) */
export function prizesFor(board: BoardId, raceStart = getRaceWindow().start): number[] {
  return (PRIZE_HISTORY.find((p) => p.from <= raceStart) ?? PRIZE_HISTORY[PRIZE_HISTORY.length - 1]).prizes[board]
}

export const prizePool = (prizes: number[]) => prizes.reduce((sum, prize) => sum + prize, 0)

export const isBoardId = (value: unknown): value is BoardId =>
  value === 'weighted' || value === 'exclusive'

/** Day of the month each race starts on, at 00:00 UTC. */
/** Races start on this day of the month at 00:00 UTC... */
export const RACE_START_DAY = 28
/** ...from the race that began 28 Oct 2026; races before it started on the 29th */
export const RACE_DAY_CHANGED = Date.UTC(2026, 9, 28)
const EARLIER_START_DAY = 29

/**
 * The race containing `now`: [start, end) in epoch ms, UTC.
 * A start day past the end of a short month rolls into the next month
 * (Feb 29 in a non-leap year became Mar 1).
 */
export function getRaceWindow(now = Date.now()) {
  const d = new Date(now)
  const day = now >= RACE_DAY_CHANGED ? RACE_START_DAY : EARLIER_START_DAY
  const startOf = (year: number, month: number) => Date.UTC(year, month, day)

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

/** A finished race, kept for Previous Leaderboards (masked names, as on the live board) */
export type ArchivedBoard = { prizes: number[]; entries: LeaderboardEntry[] }

export type ArchivedRace = {
  /** The race's first day, e.g. "2026-09-29" */
  id: string
  start: number
  end: number
  boards: Record<BoardId, ArchivedBoard>
  archivedAt: number
  /** Where the final standings came from: Stake's API at the end, or an export added by hand */
  source: 'api' | 'import'
}

/** One line of the Previous Leaderboards picker */
export type ArchivedRaceSummary = Pick<ArchivedRace, 'id' | 'start' | 'end'> & { pools: Record<BoardId, number> }

/** "October 2026": a race is named after the month it ends in */
export const raceName = (race: Pick<ArchivedRace, 'end'>) =>
  new Date(race.end - 1).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
