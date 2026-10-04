import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLeaderboardRequest } from './server/stakeLeaderboard.js'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), leaderboardApi(env.STAKE_API_TOKEN, env.STAKE_API_URL)],
    // The Coinflip chunk carries three.js (~580 kB, loaded only on /coinflip)
    build: { chunkSizeWarningLimit: 650 },
  }
})
