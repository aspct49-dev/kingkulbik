import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLeaderboardRequest } from './server/stakeLeaderboard.js'
import { serveApi } from './server/api.js'
import type { AuthEnv } from './server/auth.js'
import { DEFAULT_SITE_URL, PAGES, robots, seoHead, sitemap } from './shared/seo.js'

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

/**
 * Search and share tags (shared/seo.ts). Every page gets its own title,
 * description, canonical link and preview tags in its HTML, so crawlers and
 * Discord/X previews see them without running the app: index.html is the home
 * page, and the build writes <page>.html for the rest (served at /<page>:
 * vercel.json cleanUrls, server/standalone.ts), plus sitemap.xml and robots.txt.
 */
function seoPages(siteUrl: string): Plugin {
  const block = /<!--seo-->[\s\S]*?<!--\/seo-->/
  const head = (pagePath: string) => `<!--seo-->
    ${seoHead(pagePath, PAGES[pagePath], siteUrl)}
    <!--/seo-->`
  let outDir = 'dist'
  let building = false
  return {
    name: 'seo-pages',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      building = config.command === 'build'
    },
    transformIndexHtml: (html) => html.replace(block, head('/')).replaceAll('%SITE_URL%', siteUrl),
    async closeBundle() {
      if (!building) return
      const index = await readFile(path.join(outDir, 'index.html'), 'utf8')
      for (const pagePath of Object.keys(PAGES)) {
        if (pagePath === '/') continue
        const file = path.join(outDir, `${pagePath.slice(1)}.html`)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, index.replace(block, head(pagePath)))
      }
      await writeFile(path.join(outDir, 'sitemap.xml'), sitemap(siteUrl))
      await writeFile(path.join(outDir, 'robots.txt'), robots(siteUrl))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // server/store.ts reads these from process.env, as it does on Vercel. Only copy ones that are set:
  // assigning undefined to process.env stores the string "undefined", which looks like a database URL
  for (const key of ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  // The public address for canonical links, previews and the sitemap (no trailing slash)
  const siteUrl = (env.SITE_URL || env.AUTH_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
  return {
    plugins: [react(), leaderboardApi(env.STAKE_API_TOKEN, env.STAKE_API_URL), siteApi(env), seoPages(siteUrl)],
    // The Coinflip chunk carries three.js (~580 kB, loaded only on /coinflip)
    build: { chunkSizeWarningLimit: 650 },
  }
})
