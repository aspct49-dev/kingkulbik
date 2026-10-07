/*
 * Linking a Stake username: is this player under code KINGKULBIK, and how much
 * have they wagered? First the affiliate API's referred-users export, filtered
 * by username (`sort` is required by Stake):
 *
 *   GET https://api.stake.com/affiliate/referred-users?sort=createdAtDesc&username=<name>
 *   x-access-token: STAKE_API_TOKEN
 *   → text/csv: …,user,…,total_wagered (USD),…  (one row if they're ours)
 *
 * If the token isn't allowed to read that export (Stake answers 400/401/403),
 * the all-time leaderboard is used instead: every player under the code who
 * has wagered, with their all-time wager. Players who haven't bet yet aren't
 * on it, so they can link once they've placed a bet.
 *
 *   GET https://api.stake.com/affiliate/leaderboard?timePeriod=allTime&isStakeExclusive=false&limit=…
 *
 * Only the username and the wager leave this module; the export also carries
 * deposits, revenue and KYC data, which never reach the browser.
 *
 * The lookup proves the name is under the code, not that the person typing it
 * owns it. An admin can review links once accounts live in a database.
 */

import { parseCsv } from './stakeLeaderboard.js'

const DEFAULT_BASE = 'https://api.stake.com'
const CACHE_MS = 60_000

export type StakePlayer = {
  /** The name as Stake spells it */
  username: string
  /** All-time wager under the code, USD */
  wagered: number
}

export class StakeLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Stake usernames: letters, digits and underscores */
export function validStakeName(name: string) {
  return /^[A-Za-z0-9_]{3,20}$/.test(name)
}

const cache = new Map<string, { at: number; value: StakePlayer | null }>()

const toNumber = (value: string | undefined) => {
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Stake refused the referred-users export for this token: use the leaderboard instead */
class ExportRefused extends Error {}

/** The player under our code with this name, or null if they aren't one of ours */
export async function lookupStakePlayer(
  name: string,
  token: string | undefined,
  base: string | undefined,
): Promise<StakePlayer | null> {
  if (!token) throw new StakeLinkError('Stake linking is not configured (STAKE_API_TOKEN).', 500)
  const key = name.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  let value: StakePlayer | null
  try {
    value = await fromReferredUsers(name, token, base)
  } catch (err) {
    if (!(err instanceof ExportRefused)) throw err
    value = (await allTimeBoard(token, base)).get(key) ?? null
  }
  cache.set(key, { at: Date.now(), value })
  return value
}

async function stakeCsv(url: URL, token: string) {
  try {
    return await fetch(url, {
      headers: { 'x-access-token': token, Accept: 'text/csv' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new StakeLinkError('Could not reach Stake. Please try again in a moment.', 502)
  }
}

async function fromReferredUsers(name: string, token: string, base: string | undefined): Promise<StakePlayer | null> {
  const url = new URL('/affiliate/referred-users', base || DEFAULT_BASE)
  url.searchParams.set('sort', 'createdAtDesc')
  url.searchParams.set('username', name)
  const res = await stakeCsv(url, token)
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new ExportRefused()
  if (!res.ok) throw new StakeLinkError('Stake did not answer. Please try again in a moment.', 502)

  const [header, ...rows] = parseCsv(await res.text())
  if (!header) return null
  const cols = header.map((h) => h.trim().toLowerCase())
  const iUser = cols.indexOf('user')
  const iWager = cols.findIndex((c) => c.startsWith('total_wagered'))
  const iSnapshot = cols.findIndex((c) => c.startsWith('user_snapshot_total_wagered'))
  if (iUser < 0) throw new StakeLinkError('Unexpected answer from Stake.', 502)

  // The filter can match loosely; only an exact (case-insensitive) name counts
  const key = name.toLowerCase()
  const row = rows.find((r) => r[iUser]?.trim().toLowerCase() === key)
  return row
    ? {
        username: row[iUser].trim(),
        wagered: Math.max(toNumber(row[iWager]), iSnapshot >= 0 ? toNumber(row[iSnapshot]) : 0),
      }
    : null
}

const BOARD_PAGE = 5000
let board: { at: number; players: Map<string, StakePlayer> } | null = null

/** Everyone under the code who has wagered, by lower-case name, with their all-time wager */
async function allTimeBoard(token: string, base: string | undefined) {
  if (board && Date.now() - board.at < CACHE_MS) return board.players
  const players = new Map<string, StakePlayer>()
  for (let offset = 0; ; offset += BOARD_PAGE) {
    const url = new URL('/affiliate/leaderboard', base || DEFAULT_BASE)
    url.search = new URLSearchParams({
      timePeriod: 'allTime',
      isStakeExclusive: 'false',
      limit: String(BOARD_PAGE),
      offset: String(offset),
    }).toString()
    const res = await stakeCsv(url, token)
    if (!res.ok) throw new StakeLinkError('Stake did not answer. Please try again in a moment.', 502)
    const [header, ...rows] = parseCsv(await res.text())
    if (!header) break
    const cols = header.map((h) => h.trim().toLowerCase())
    const iUser = cols.indexOf('user_name')
    const iWager = cols.findIndex((c) => c.startsWith('total_wagered'))
    if (iUser < 0 || iWager < 0) throw new StakeLinkError('Unexpected answer from Stake.', 502)
    for (const r of rows) {
      const username = r[iUser]?.trim()
      if (username) players.set(username.toLowerCase(), { username, wagered: toNumber(r[iWager]) })
    }
    if (rows.length < BOARD_PAGE) break
  }
  board = { at: Date.now(), players }
  return players
}
