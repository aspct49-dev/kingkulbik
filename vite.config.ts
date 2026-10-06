import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLeaderboardRequest } from './server/stakeLeaderboard.js'
import { serveApi } from './server/api.js'
import type { AuthEnv } from './server/auth.js'

/**
 * Serves /api/leaderboard from `vite` and `vite preview`, mirroring the Vercel
 * Function in api/leaderboard.ts. The token comes from .env.local and stays in
 * this Node process; only VITE_-prefixed variables ever reach the browser.
 */
function leaderboardApi(token: string | undefined, apiUrl: string | undefined): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/leaderboard') return next()

    const { status, body } = await handleLeaderboardRequest(url.searchParams.get('board'), token, apiUrl)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'leaderboard-api',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

/** Serves every other /api/* route from `vite` and `vite preview`, mirroring api/router.ts */
function siteApi(env: AuthEnv): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    if (!(await serveApi(req, res, env))) next()
  }

  return {
    name: 'site-api',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // server/store.ts reads these from process.env, as it does on Vercel
  for (const key of ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN']) process.env[key] ??= env[key]
  return {
    plugins: [react(), leaderboardApi(env.STAKE_API_TOKEN, env.STAKE_API_URL), siteApi(env)],
    // The Coinflip chunk carries three.js (~580 kB, loaded only on /coinflip)
    build: { chunkSizeWarningLimit: 650 },
  }
})
