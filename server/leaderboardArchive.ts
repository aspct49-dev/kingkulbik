/*
 * Previous leaderboards: every finished race's final standings, both boards.
 *
 * Archiving is automatic on the VPS: half an hour after a race ends (Stake's
 * numbers settle), the server fetches that race's final standings from
 * Stake's API, with that race's prizes, and keeps them. A failed fetch is
 * tried again every 15 minutes until it works. Races from before this
 * existed come from SEED_RACES (Stake exports, names masked).
 *
 *   GET /api/leaderboard/archive         every finished race, newest first (summaries)
 *   GET /api/leaderboard/archive/<id>    one race's standings, both boards
 */

import { getRaceWindow, prizePool, prizesFor } from '../shared/leaderboard.js'
import type { ArchivedRace, ArchivedRaceSummary } from '../shared/leaderboard.js'
import { json } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { SEED_RACES } from './leaderboardSeed.js'
import { fetchStandings } from './stakeLeaderboard.js'
import { read, StoreError, update } from './store.js'

const CHECK_EVERY_MS = 15 * 60_000
/** After a race ends, wait this long for Stake's totals to settle before keeping them */
const SETTLE_MS = 30 * 60_000

const raceId = (start: number) => new Date(start).toISOString().slice(0, 10)

const summary = (r: ArchivedRace): ArchivedRaceSummary => ({
  id: r.id,
  start: r.start,
  end: r.end,
  pools: { weighted: prizePool(r.boards.weighted.prizes), exclusive: prizePool(r.boards.exclusive.prizes) },
})

/** Every finished race: the stored ones plus the seed (a stored copy of a race wins), newest first */
async function races(): Promise<ArchivedRace[]> {
  const stored = await read('leaderboardArchive')
  const ids = new Set(stored.map((r) => r.id))
  return [...stored, ...SEED_RACES.filter((r) => !ids.has(r.id))].sort((a, b) => b.start - a.start)
}

/** Keep the race before the current one once it has settled (nothing to do if it's kept already) */
export async function archiveLastRace(env: AuthEnv & { STAKE_API_URL?: string }, now = Date.now()) {
  const last = getRaceWindow(getRaceWindow(now).start - 1)
  if (now < last.end + SETTLE_MS) return null
  const id = raceId(last.start)
  if ((await races()).some((r) => r.id === id)) return null
  if (!env.STAKE_API_TOKEN) throw new Error('STAKE_API_TOKEN is not set')

  const options = env.STAKE_API_URL ? { apiUrl: env.STAKE_API_URL } : {}
  const [weighted, exclusive] = await Promise.all([
    fetchStandings('weighted', last, env.STAKE_API_TOKEN, options),
    fetchStandings('exclusive', last, env.STAKE_API_TOKEN, options),
  ])
  const race: ArchivedRace = {
    id,
    start: last.start,
    end: last.end,
    boards: {
      weighted: { prizes: prizesFor('weighted', last.start), entries: weighted },
      exclusive: { prizes: prizesFor('exclusive', last.start), entries: exclusive },
    },
    archivedAt: Date.now(),
    source: 'api',
  }
  await update('leaderboardArchive', (list) => (list.some((r) => r.id === id) ? list : [race, ...list]))
  console.log(`[leaderboard] archived the race of ${id}`)
  return race
}

/** On the VPS: archive each race once it has finished (checked every 15 minutes, and at start) */
export function startLeaderboardArchiver(env: AuthEnv & { STAKE_API_URL?: string }) {
  const check = () =>
    archiveLastRace(env).catch((err: Error) => console.error('[leaderboard] archiving failed, will retry:', err.message))
  setInterval(() => void check(), CHECK_EVERY_MS).unref()
  void check()
}

export async function handleLeaderboardArchiveRequest(req: AuthRequest): Promise<AuthResponse | null> {
  const path = new URL(req.url, 'http://localhost').pathname
  const match = path.match(/^\/api\/leaderboard\/archive(?:\/(\d{4}-\d{2}-\d{2}))?$/)
  if (!match) return null
  if (req.method !== 'GET') return json(405, { error: 'Use GET.' })
  try {
    const all = await races()
    const kept = (body: unknown) => {
      const res = json(200, body)
      // Finished races don't change: browsers may keep them for a few minutes
      res.headers['Cache-Control'] = 'public, max-age=300'
      return res
    }
    if (!match[1]) return kept({ races: all.map(summary) })
    const race = all.find((r) => r.id === match[1])
    return race ? kept({ race }) : json(404, { error: 'No finished race with that date.' })
  } catch (err) {
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
