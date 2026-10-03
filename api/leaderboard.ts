/*
 * Vercel Function: GET /api/leaderboard?board=weighted|exclusive
 *
 * Set STAKE_API_TOKEN under Project → Settings → Environment Variables.
 * Locally, the Vite dev/preview server serves the same route (see vite.config.ts).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleLeaderboardRequest } from '../server/stakeLeaderboard.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const { status, body } = await handleLeaderboardRequest(
    url.searchParams.get('board'),
    process.env.STAKE_API_TOKEN,
    process.env.STAKE_API_URL,
  )

  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // Shared CDN cache: Stake is called at most about once a minute per board
  res.setHeader(
    'Cache-Control',
    status === 200 ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store',
  )
  res.end(JSON.stringify(body))
}
