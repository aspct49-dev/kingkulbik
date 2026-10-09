/*
 * The production server for a VPS: one Node process that serves the built site
 * (dist/), every /api route and uploaded images. nginx sits in front of it for
 * HTTPS and passes requests here on 127.0.0.1:PORT (deploy/nginx.conf).
 *
 * Built into dist-server/server.mjs by `npm run build:server`; started by
 * `npm start` (systemd: deploy/kingkulbik.service), which loads .env.
 *
 * On Vercel the same routes run as functions (api/), and in development the
 * Vite server serves them (vite.config.ts); all three share server/.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveApi } from './api.js'
import type { AuthEnv } from './auth.js'
import { startKickChat } from './kickChat.js'
import { startWatchCounter } from './raffles.js'
import { handleLeaderboardRequest } from './stakeLeaderboard.js'
import { storeKind } from './store.js'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '127.0.0.1'
/** The built site: dist/ next to dist-server/ */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const env = process.env as AuthEnv & { STAKE_API_URL?: string }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

/** A file inside dist/, or null (never anything outside it) */
async function findFile(urlPath: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const file = path.resolve(ROOT, '.' + decoded)
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null
  const info = await stat(file).catch(() => null)
  return info?.isFile() ? { file, size: info.size } : null
}

async function sendFile(req: IncomingMessage, res: ServerResponse, file: string, size: number, cache: string, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Content-Length', size)
  res.setHeader('Cache-Control', cache)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'HEAD') return void res.end()
  createReadStream(file).pipe(res)
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const found = pathname !== '/' && (await findFile(pathname))
  if (found) {
    // Vite fingerprints everything under /assets/: safe to keep for a year
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
    return sendFile(req, res, found.file, found.size, cache)
  }
  // A page with its own HTML (title, description and share tags written by the build): /leaderboard → leaderboard.html
  const page = !path.extname(pathname) && pathname !== '/' && (await findFile(pathname.replace(/\/+$/, '') + '.html'))
  if (page) return sendFile(req, res, page.file, page.size, 'no-cache')
  // A missing file with an extension is a real 404, not a page
  if (path.extname(pathname)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return void res.end('Not found')
  }
  // Every page is the app; React Router picks the screen. Always re-checked so a deploy shows at once.
  const index = await findFile('/index.html')
  if (!index) {
    res.statusCode = 500
    return void res.end('The site is not built: run npm run build')
  }
  await sendFile(req, res, index.file, index.size, 'no-cache', isAppRoute(pathname) ? 200 : 404)
}

/**
 * App routes without a page of their own in shared/seo.ts. Any other unknown
 * path still gets the app (it shows "page not found") but with a 404 status,
 * so search engines don't index it.
 */
const isAppRoute = (pathname: string) => pathname === '/' || pathname.startsWith('/overlay/')

/** The site's one address (SITE_URL, else AUTH_URL), e.g. https://kingkulbik.com */
const canonical = (() => {
  try {
    return new URL(process.env.SITE_URL || process.env.AUTH_URL || '')
  } catch {
    return null
  }
})()

/**
 * www.<domain> sends visitors to <domain>. Sign-in always finishes on the main
 * address, and its cookie belongs to that address only, so someone browsing on
 * www would otherwise look signed out.
 */
function wwwRedirect(req: IncomingMessage, res: ServerResponse) {
  if (!canonical) return false
  const forwarded = req.headers['x-forwarded-host']
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host ?? ''
  if (host.toLowerCase() !== `www.${canonical.host}`) return false
  res.statusCode = 301
  res.setHeader('Location', canonical.origin + (req.url ?? '/'))
  res.end()
  return true
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (wwwRedirect(req, res)) return
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/leaderboard') {
    const { status, body } = await handleLeaderboardRequest(
      url.searchParams.get('board'),
      env.STAKE_API_TOKEN,
      env.STAKE_API_URL,
    )
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    return void res.end(JSON.stringify(body))
  }

  if (url.pathname.startsWith('/api/')) {
    // Behind nginx: the real host and scheme come from X-Forwarded-* (sign-in redirects need them)
    if (await serveApi(req, res, env, true)) return
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return void res.end(JSON.stringify({ error: 'Not found.' }))
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return void res.end()
  }
  return serveStatic(req, res, url.pathname)
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[server]', req.method, req.url, err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Something went wrong. Please try again.' }))
    } else res.end()
  })
}).listen(PORT, HOST, () => {
  console.log(`[server] King Kulbik on http://${HOST}:${PORT} (serving ${ROOT})`)
  if (!env.SESSION_SECRET) console.warn('[server] SESSION_SECRET is not set: sign-in will not work')
  console.log(`[server] store: ${storeKind()}`)
  // A long-running server: count watch time and keep Kick chat connected in the background
  startKickChat(env)
  startWatchCounter(env)
})
