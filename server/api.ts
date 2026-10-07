/*
 * One entry point for every /api/* route except the leaderboard: sign-in and
 * linked accounts, the originals, the admin panel and its content. Served by
 * api/router.ts on Vercel and by the Vite middleware locally.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleAdminRequest } from './admin.js'
import { handleAuthRequest, json, readSession } from './auth.js'
import { handleEventsRequest } from './events.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { handleOriginalsRequest } from './originals.js'
import { handleProfileRequest, touchProfile } from './profiles.js'
import { handleRaffleRequest } from './raffles.js'
import { handleShopRequest } from './shop.js'
import { handleSocialsRequest } from './socials.js'

/** Image uploads are base64 JSON (3 MB of image ≈ 4 MB of text); everything else is small */
const bodyLimit = (url: string) => (url.startsWith('/api/admin/upload') ? 4_300_000 : 64_000)

export async function handleApiRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  try {
    // Every page load asks who's signed in: that keeps their profile current
    if (req.url.startsWith('/api/auth/me')) {
      const user = readSession(req, env)
      if (user) await touchProfile(user).catch(() => undefined)
    }
    return (
      (await handleAuthRequest(req, env)) ??
      (await handleOriginalsRequest(req, env)) ??
      (await handleEventsRequest(req, env)) ??
      (await handleSocialsRequest(req)) ??
      (await handleShopRequest(req, env)) ??
      (await handleProfileRequest(req, env)) ??
      (await handleRaffleRequest(req, env)) ??
      (await handleAdminRequest(req, env))
    )
  } catch (err) {
    console.error('[api] unhandled:', err)
    return json(500, { error: 'Something went wrong. Please try again.' })
  }
}

/** Node adapter: reads the request, answers it, or returns false when no route matched */
export async function serveApi(
  req: IncomingMessage,
  res: ServerResponse,
  env: AuthEnv,
  forwarded = false,
): Promise<boolean> {
  const header = (name: string) => {
    const value = req.headers[name]
    return Array.isArray(value) ? value[0] : value
  }
  const url = req.url ?? '/'

  let body: string | undefined
  if (req.method === 'POST') {
    const limit = bodyLimit(url)
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > limit) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'That request is too large.' }))
        return true
      }
      chunks.push(chunk as Buffer)
    }
    body = Buffer.concat(chunks).toString('utf8')
  }

  const result = await handleApiRequest(
    {
      method: req.method ?? 'GET',
      url,
      cookie: header('cookie'),
      host: (forwarded ? header('x-forwarded-host') : undefined) ?? header('host'),
      proto: forwarded ? header('x-forwarded-proto') : undefined,
      body,
    },
    env,
  )
  if (!result) return false
  res.statusCode = result.status
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
  res.end(result.body)
  return true
}
