/*
 * Vercel Function: every /api/* route except the leaderboard (sign-in, linked
 * accounts, the originals, the admin panel). vercel.json rewrites /api/* here,
 * since a [...route] file only catches one path segment outside Next.js; req.url
 * keeps the original path. The logic lives in server/; the Vite dev server
 * serves the same routes locally (see vite.config.ts).
 *
 * Environment variables (Project → Settings → Environment Variables):
 * DISCORD_CLIENT_ID/SECRET, KICK_CLIENT_ID/SECRET, SESSION_SECRET,
 * STAKE_API_TOKEN and ADMIN_DISCORD_IDS. Register the
 * https://<domain>/api/auth/{discord,kick}/callback redirects on both apps.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveApi } from '../server/api.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const served = await serveApi(req, res, process.env, true)
  if (!served) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Not found.' }))
  }
}
