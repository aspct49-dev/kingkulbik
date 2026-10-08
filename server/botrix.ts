/*
 * BotRix loyalty points (King Points).
 *
 * Reading needs no credentials: the public leaderboard answers "how many
 * points does <kick name> have on this channel":
 *   GET https://botrix.live/api/public/leaderboard?platform=kick&user=<channel>&search=<viewer>
 *   → [{ name, points, watchtime (minutes), level, xp, followage }]
 *
 * Changing points uses the extension endpoint with the channel's bid token
 * (BOTRIX_BID), the same call the au-slots shop makes:
 *   GET https://botrix.live/api/extension/substractPoints?name=<viewer>&platform=kick&points=<n>&bid=<bid>
 *   → { success: true } | { success: false, reason: 'user_not_found' | … }
 * BotRix's sign convention: a positive n TAKES points, a negative n ADDS them.
 * A wrong bid gets an empty 200 reply. (The dashboard's /api/loyalty/* calls
 * are a different thing: they need a logged-in session and refuse the bid.)
 */

/** BOTRIX_API_BASE points at a stand-in for testing (never touches real points) */
const BASE = (process.env.BOTRIX_API_BASE || 'https://botrix.live').replace(/\/+$/, '')
const LEADERBOARD = `${BASE}/api/public/leaderboard`
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
export async function getBotrixViewer(kickName: string, fresh = false): Promise<BotrixViewer | null> {
  const key = kickName.toLowerCase()
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const url = new URL(LEADERBOARD)
  url.searchParams.set('platform', 'kick')
  url.searchParams.set('user', BOTRIX_CHANNEL)
  url.searchParams.set('search', kickName)
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  })
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

// ---------------------------------------------------------------- changing points

const EXTENSION = `${BASE}/api/extension/substractPoints`

export class BotrixError extends Error {
  constructor(
    message: string,
    /** user_not_found, insufficient, bid, unreachable, … */
    readonly code: string,
  ) {
    super(message)
  }
}

/**
 * Add (delta > 0) or take (delta < 0) King Points. Throws BotrixError with a
 * message fit to show an admin or player.
 */
export async function adjustBotrixPoints(kickName: string, delta: number, bid: string | undefined): Promise<void> {
  if (!bid) throw new BotrixError('The BotRix bid token is not set (BOTRIX_BID).', 'bid')
  if (!Number.isInteger(delta) || delta === 0) throw new BotrixError('Change points by a whole number.', 'input')
  const url = new URL(EXTENSION)
  url.searchParams.set('name', kickName)
  url.searchParams.set('platform', 'kick')
  // BotRix's convention is the reverse of ours: positive takes, negative adds
  url.searchParams.set('points', String(-delta))
  url.searchParams.set('bid', bid)

  let text: string
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
    text = await res.text()
    if (!res.ok) throw new BotrixError(`BotRix answered ${res.status}.`, 'unreachable')
  } catch (err) {
    if (err instanceof BotrixError) throw err
    throw new BotrixError('Could not reach BotRix. Please try again.', 'unreachable')
  } finally {
    cache.delete(kickName.toLowerCase())
  }

  let body: { success?: boolean; reason?: string } | null = null
  try {
    body = text.trim() ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!body) throw new BotrixError('BotRix refused the bid token. Check BOTRIX_BID.', 'bid')
  if (body.success) return
  const reason = String(body.reason ?? '')
  if (reason === 'user_not_found') throw new BotrixError(`BotRix has no viewer called ${kickName} on this channel.`, 'user_not_found')
  if (delta < 0) throw new BotrixError(`${kickName} doesn’t have enough King Points.`, 'insufficient')
  throw new BotrixError(`BotRix didn’t make the change${reason ? ` (${reason})` : ''}.`, reason || 'failed')
}
