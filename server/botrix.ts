/*
 * BotRix loyalty points (read-only).
 *
 * BotRix's public leaderboard answers "how many points does <kick name> have
 * on this channel" without any credentials:
 *   GET https://botrix.live/api/public/leaderboard?platform=kick&user=<channel>&search=<viewer>
 *   → [{ name, points, watchtime (minutes), level, xp, followage }]
 *
 * Changing points is not possible from here yet: the dashboard's
 * /api/loyalty/* calls need a logged-in BotRix session (the widget "bid"
 * token is refused with "Sesion no valida"). That needs the Premium
 * management API key; until then, spending points is handled by hand.
 */

const LEADERBOARD = 'https://botrix.live/api/public/leaderboard'
export const BOTRIX_CHANNEL = 'kingkulbik'
const CACHE_MS = 60_000

export type BotrixViewer = {
  name: string
  points: number
  /** Minutes watched */
  watchtime: number
  level: number
}

const cache = new Map<string, { at: number; value: BotrixViewer | null }>()

/** A viewer's points on the King Kulbik channel, or null if BotRix has never seen them */
export async function getBotrixViewer(kickName: string): Promise<BotrixViewer | null> {
  const key = kickName.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const url = new URL(LEADERBOARD)
  url.searchParams.set('platform', 'kick')
  url.searchParams.set('user', BOTRIX_CHANNEL)
  url.searchParams.set('search', kickName)
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`BotRix answered ${res.status}`)
  const rows = (await res.json()) as { name?: string; points?: number; watchtime?: number; level?: number }[]
  // The search is a prefix/contains match: pick the exact name
  const row = Array.isArray(rows) ? rows.find((r) => r.name?.toLowerCase() === key) : undefined
  const value = row
    ? { name: row.name ?? kickName, points: row.points ?? 0, watchtime: row.watchtime ?? 0, level: row.level ?? 0 }
    : null
  cache.set(key, { at: Date.now(), value })
  return value
}
