/*
 * Linking a Stake username: is this player under code KINGKULBIK, and how much
 * have they wagered? One call to the affiliate API's referred-users export,
 * filtered by username:
 *
 *   GET https://api.stake.com/affiliate/referred-users?username=<name>
 *   x-access-token: STAKE_API_TOKEN
 *   → text/csv: …,user,…,total_wagered (USD),…  (one row if they're ours)
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

  const url = new URL('/affiliate/referred-users', base || DEFAULT_BASE)
  url.searchParams.set('username', name)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'x-access-token': token, Accept: 'text/csv' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new StakeLinkError('Could not reach Stake. Please try again in a moment.', 502)
  }
  if (!res.ok) throw new StakeLinkError('Stake did not answer. Please try again in a moment.', 502)

  const [header, ...rows] = parseCsv(await res.text())
  if (!header) {
    cache.set(key, { at: Date.now(), value: null })
    return null
  }
  const cols = header.map((h) => h.trim().toLowerCase())
  const iUser = cols.indexOf('user')
  const iWager = cols.findIndex((c) => c.startsWith('total_wagered'))
  const iSnapshot = cols.findIndex((c) => c.startsWith('user_snapshot_total_wagered'))
  if (iUser < 0) throw new StakeLinkError('Unexpected answer from Stake.', 502)

  // The filter can match loosely; only an exact (case-insensitive) name counts
  const row = rows.find((r) => r[iUser]?.trim().toLowerCase() === key)
  const value = row
    ? {
        username: row[iUser].trim(),
        wagered: Math.max(toNumber(row[iWager]), iSnapshot >= 0 ? toNumber(row[iSnapshot]) : 0),
      }
    : null
  cache.set(key, { at: Date.now(), value })
  return value
}
