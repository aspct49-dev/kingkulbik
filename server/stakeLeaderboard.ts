/*
 * Stake affiliate leaderboard proxy — server-side only.
 *
 * The browser calls /api/leaderboard?board=weighted|exclusive. This module
 * calls Stake's affiliate API with the secret token and returns only what the
 * page needs: a masked name, the amounts and the prize per place.
 *
 *   GET https://api.stake.com/affiliate/leaderboard
 *     ?timePeriod=customRange&isStakeExclusive=<bool>&limit=<n>
 *     &startDate=<epoch ms>&endDate=<epoch ms, inclusive>
 *   x-access-token: <STAKE_API_TOKEN>
 *   → text/csv: rank,user_name,campaign_code,total_wagered_amount (USD),total_weighted_amount (USD)
 *
 * Docs: https://docs.stake.com/#tag/Affiliate/operation/LeaderboardCsv
 *
 * The token is read from the environment (STAKE_API_TOKEN) and is never sent
 * to the browser, logged, or included in error messages.
 */

import { BOARDS, getRaceWindow } from '../shared/leaderboard.js'
import type { BoardId, LeaderboardEntry, LeaderboardResponse } from '../shared/leaderboard.js'

const STAKE_LEADERBOARD_URL = 'https://api.stake.com/affiliate/leaderboard'
const REQUEST_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 60_000

export class LeaderboardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Minimal RFC 4180 parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

/** "Aydent9" → "Ayd***t9", the same masking kingkulbik.com uses. */
export function maskName(name: string) {
  const n = name.trim()
  if (n.length <= 5) return n.slice(0, 1) + '***'
  return n.slice(0, 3) + '***' + n.slice(-2)
}

const toNumber = (value: string | undefined) => {
  const n = Number(String(value ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Columns are found by name rather than position, and loosely
 * ("total_weighted_amount (USD)" matches "total_weighted"), so a reordered or
 * renamed column upstream costs a field, not the whole board.
 */
export function parseLeaderboardCsv(csv: string) {
  const [header, ...rows] = parseCsv(csv)
  if (!header) return []
  const cols = header.map((h) => h.trim().toLowerCase())
  const find = (...names: string[]) => cols.findIndex((c) => names.some((n) => c.startsWith(n)))

  const iRank = find('rank')
  const iName = find('user_name', 'username', 'user')
  const iWagered = find('total_wagered', 'wagered')
  const iWeighted = find('total_weighted', 'weighted')
  if (iName < 0 || (iWagered < 0 && iWeighted < 0)) {
    throw new LeaderboardError('Unexpected CSV columns', 502)
  }

  return rows.map((r) => {
    const wagered = toNumber(r[iWagered])
    return {
      rank: iRank >= 0 ? toNumber(r[iRank]) : 0,
      name: (r[iName] ?? '').trim(),
      wagered,
      // Without a weighted column, raw wager is the ranking amount
      weighted: iWeighted >= 0 ? toNumber(r[iWeighted]) : wagered,
    }
  })
}

const cache = new Map<string, { at: number; data: LeaderboardResponse }>()

export async function getLeaderboard(
  boardId: BoardId,
  token: string,
  { now = Date.now(), fetchImpl = fetch, apiUrl = STAKE_LEADERBOARD_URL } = {},
): Promise<LeaderboardResponse> {
  const board = BOARDS[boardId]
  const window = getRaceWindow(now)
  const cacheKey = `${boardId}:${window.start}`

  const hit = cache.get(cacheKey)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.data

  const url = new URL(apiUrl)
  url.search = new URLSearchParams({
    timePeriod: 'customRange',
    isStakeExclusive: String(board.stakeExclusive),
    limit: String(Math.max(board.prizes.length, 50)),
    startDate: String(window.start),
    endDate: String(window.end - 1), // Stake's endDate is inclusive
  }).toString()

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)

  let csv: string
  try {
    const upstream = await fetchImpl(url, {
      headers: { 'x-access-token': token, Accept: 'text/csv' },
      signal: abort.signal,
    })
    csv = await upstream.text()
    if (!upstream.ok) {
      // Report the status only, never the token or the request URL.
      console.error('[leaderboard] %s: Stake responded %s', boardId, upstream.status)
      throw new LeaderboardError(`Stake responded ${upstream.status}`, 502)
    }
  } catch (err) {
    if (err instanceof LeaderboardError) throw err
    const timedOut = err instanceof Error && err.name === 'AbortError'
    console.error('[leaderboard] %s: Stake %s', boardId, timedOut ? 'timed out' : 'unreachable')
    throw new LeaderboardError(timedOut ? 'Stake timed out' : 'Stake unreachable', 504)
  } finally {
    clearTimeout(timer)
  }

  // Ranked by weighted wager, as on kingkulbik.com; players with nothing
  // counted yet would otherwise sit in a paying place ahead of an empty slot.
  const entries: LeaderboardEntry[] = parseLeaderboardCsv(csv)
    .filter((row) => row.name && row.weighted > 0)
    .sort((a, b) => b.weighted - a.weighted || a.rank - b.rank)
    .slice(0, board.prizes.length)
    .map((row, i) => ({
      rank: i + 1,
      name: maskName(row.name),
      wagered: row.wagered,
      weighted: row.weighted,
      prize: board.prizes[i] ?? 0,
    }))

  const data: LeaderboardResponse = { board: boardId, window, entries, updatedAt: now }
  cache.set(cacheKey, { at: now, data })
  return data
}

/**
 * Framework-agnostic handler: (board query value, env) → status + JSON body.
 * `apiUrl` (STAKE_API_URL) optionally overrides the Stake endpoint, e.g. for a mock.
 */
export async function handleLeaderboardRequest(
  boardParam: string | null,
  token: string | undefined,
  apiUrl?: string,
) {
  const boardId = boardParam ?? 'weighted'
  if (boardId !== 'weighted' && boardId !== 'exclusive') {
    return { status: 400, body: { error: 'Unknown board' } }
  }
  if (!token) {
    return { status: 503, body: { error: 'Leaderboard is not configured' } }
  }
  try {
    return { status: 200, body: await getLeaderboard(boardId, token, apiUrl ? { apiUrl } : {}) }
  } catch (err) {
    const status = err instanceof LeaderboardError ? err.status : 500
    return { status, body: { error: err instanceof Error ? err.message : 'Leaderboard unavailable' } }
  }
}
