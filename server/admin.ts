/*
 * Admin panel API and the public content it manages.
 *
 * Public
 *   GET  /api/content/challenges        active and completed challenges
 *   GET  /api/content/shop              visible store items
 *   GET  /api/uploads/<name>            an uploaded image
 *
 * Admin (Discord ids in ADMIN_DISCORD_IDS, checked on every request)
 *   GET  /api/admin/status              who you are, counts, recent bets
 *   POST /api/admin/challenges          create        { game, slug?, image, multiplier, minBet, reward }
 *   POST /api/admin/challenges/<id>     update        (any of the above, status, completedBy)
 *   POST /api/admin/challenges/<id>/delete
 *   POST /api/admin/shop                create        { name, price, tier, image?, stock, hidden? }
 *   POST /api/admin/shop/<id>           update
 *   POST /api/admin/shop/<id>/delete
 *   POST /api/admin/rules               { keno: {...}, coinflip: {...} }
 *   POST /api/admin/feed/clear
 *   POST /api/admin/upload              { data: base64, type: 'image/webp' | … }
 *
 * Every write is a POST with a JSON body, so the session cookie (SameSite=Lax)
 * never rides along on a cross-site form.
 */

import { randomBytes } from 'node:crypto'
import type { Challenge, ItemTier, StoreItem } from '../shared/content.js'
import { sanitizeRules } from '../shared/originals.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { read, readUpload, saveUpload, StoreError, update, write } from './store.js'

const UPLOAD_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' } as const
const UPLOAD_MAX = 3 * 1024 * 1024
const TIERS: ItemTier[] = ['gold', 'purple', 'blue']

class InputError extends Error {}

const newId = (label: string) =>
  `${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item'}-${randomBytes(3).toString('hex')}`

function parseBody(body: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(body || '{}') as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    /* falls through */
  }
  throw new InputError('Send a JSON object.')
}

const text = (v: unknown, label: string, max: number) => {
  const s = String(v ?? '').trim()
  if (!s) throw new InputError(`${label} is required.`)
  if (s.length > max) throw new InputError(`${label}: ${max} characters at most.`)
  return s
}

const number = (v: unknown, label: string, min: number, max: number) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max.toLocaleString('en-US')}.`)
  return n
}

/** Our own files, admin uploads, or Stake catalog art; nothing else is shown on the site */
const image = (v: unknown, label = 'Image') => {
  const s = String(v ?? '').trim()
  if (/^\/content\/[\w./-]+$/.test(s) && !s.includes('..')) return s
  if (/^\/api\/uploads\/[a-z0-9-]+\.(webp|png|jpg|gif)$/.test(s)) return s
  if (/^https:\/\/mediumrare\.imgix\.net\/[\w./%-]+(\?[\w=&.%-]*)?$/.test(s)) return s
  throw new InputError(`${label}: upload one or pick a game from the catalog.`)
}

function challengeFields(body: Record<string, unknown>, current?: Challenge): Challenge {
  const has = (k: string) => k in body
  const pick = <T>(k: string, parse: (v: unknown) => T, fallback: T | undefined): T => {
    if (has(k)) return parse(body[k])
    if (fallback === undefined) return parse(undefined)
    return fallback
  }
  const status = pick('status', (v) => {
    if (v !== 'active' && v !== 'completed') throw new InputError('Status is active or completed.')
    return v
  }, current?.status ?? 'active')
  const slug = pick('slug', (v) => {
    const s = String(v ?? '').trim()
    if (s && !/^[a-z0-9-]{1,120}$/.test(s)) throw new InputError('Unknown Stake game.')
    return s || undefined
  }, current?.slug ?? '')
  const completedBy = pick('completedBy', (v) => String(v ?? '').trim().slice(0, 40) || undefined, current?.completedBy ?? '')
  return {
    id: current?.id ?? '',
    game: pick('game', (v) => text(v, 'Game', 60), current?.game),
    slug,
    image: pick('image', (v) => image(v), current?.image),
    multiplier: pick('multiplier', (v) => number(v, 'Target multiplier', 1, 10_000_000), current?.multiplier),
    minBet: pick('minBet', (v) => number(v, 'Minimum bet', 0, 100_000), current?.minBet),
    reward: pick('reward', (v) => number(v, 'Reward', 0, 1_000_000), current?.reward),
    status,
    completedBy: status === 'completed' ? completedBy : undefined,
    createdAt: current?.createdAt ?? Date.now(),
  }
}

function itemFields(body: Record<string, unknown>, current?: StoreItem): StoreItem {
  const has = (k: string) => k in body
  const name = has('name') || !current ? text(body.name, 'Name', 40) : current.name
  const price = has('price') || !current ? Math.round(number(body.price, 'Price', 0, 1_000_000_000)) : current.price
  const tier = has('tier') || !current ? (body.tier as ItemTier) : current.tier
  if (!TIERS.includes(tier)) throw new InputError('Tier is gold, purple or blue.')
  let img = current?.image
  if (has('image')) img = body.image ? image(body.image, 'Photo') : undefined
  let stock = current?.stock ?? null
  if (has('stock')) {
    stock = body.stock === null || body.stock === '' ? null : Math.round(number(body.stock, 'Stock', 0, 1_000_000))
  }
  const hidden = has('hidden') ? Boolean(body.hidden) : Boolean(current?.hidden)
  return {
    id: current?.id ?? '',
    name,
    price,
    tier,
    ...(img ? { image: img } : {}),
    // Hand-placed boxes belong to the built-in photos; a new photo is centred
    ...(img && current?.imageBox && img === current.image ? { imageBox: current.imageBox } : {}),
    stock,
    ...(hidden ? { hidden: true } : {}),
    createdAt: current?.createdAt ?? Date.now(),
  }
}

export async function handleAdminRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  // ---- public
  if (path === '/api/content/challenges') return json(200, { challenges: await read('challenges') })
  if (path === '/api/content/shop') return json(200, { items: (await read('shop')).filter((i) => !i.hidden) })
  if (path.startsWith('/api/uploads/')) {
    const name = path.slice('/api/uploads/'.length)
    const bytes = await readUpload(name)
    if (!bytes) return json(404, { error: 'Not found.' })
    const ext = name.split('.').pop() as string
    const type = Object.entries(UPLOAD_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
    return {
      status: 200,
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
      body: bytes,
    }
  }

  if (!path.startsWith('/api/admin/')) return null
  const route = path.slice('/api/admin/'.length)

  const user = readSession(req, env)
  if (route === 'status') {
    const admin = isAdmin(user, env)
    // 200 either way: the page shows the right gate without a failed request in the console
    if (!admin) return json(200, { admin: false, signedIn: Boolean(user), discordId: user?.discord.id ?? null })
    const [challenges, shop, feed, rules, hunts, guesses, tournaments, giveaway, redemptions, players] = await Promise.all([
      read('challenges'),
      read('shop'),
      read('feed'),
      read('rules'),
      read('hunts'),
      read('guesses'),
      read('tournaments'),
      read('giveaway'),
      read('redemptions'),
      read('players'),
    ])
    return json(200, {
      admin: true,
      discordId: user!.discord.id,
      challenges,
      shop,
      rules,
      feed,
      hunts,
      guesses,
      tournaments,
      giveaway,
      pending: redemptions.filter((r) => r.status === 'pending').length,
      players: players.length,
    })
  }

  if (!isAdmin(user, env)) return json(user ? 403 : 401, { error: 'Admins only.' })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  try {
    const body = parseBody(req.body)

    if (route === 'upload') {
      const ext = UPLOAD_TYPES[String(body.type) as keyof typeof UPLOAD_TYPES]
      if (!ext) throw new InputError('Upload a WebP, PNG, JPEG or GIF image.')
      const bytes = Buffer.from(String(body.data ?? ''), 'base64')
      if (!bytes.length) throw new InputError('That file is empty.')
      if (bytes.length > UPLOAD_MAX) throw new InputError('Images can be 3 MB at most.')
      return json(200, { url: await saveUpload(bytes, ext) })
    }

    if (route === 'rules') return json(200, { rules: await write('rules', sanitizeRules(body)).then(() => read('rules')) })

    if (route === 'feed/clear') {
      await write('feed', [])
      return json(200, { feed: [] })
    }

    // ---- challenges
    if (route === 'challenges') {
      const challenge = challengeFields(body)
      challenge.id = newId(`${challenge.game}-${challenge.multiplier}`)
      const challenges = await update('challenges', (list) => [challenge, ...list])
      return json(200, { challenge, challenges })
    }
    const ch = route.match(/^challenges\/([\w-]+)(\/delete)?$/)
    if (ch) {
      let found: Challenge | undefined
      const challenges = await update('challenges', (list) => {
        const i = list.findIndex((c) => c.id === ch[1])
        if (i < 0) throw new InputError('That challenge no longer exists.')
        if (ch[2]) return list.filter((_, j) => j !== i)
        found = challengeFields(body, list[i])
        return list.map((c, j) => (j === i ? found! : c))
      })
      return json(200, { challenge: found ?? null, challenges })
    }

    // ---- shop
    if (route === 'shop') {
      const item = itemFields(body)
      item.id = newId(item.name)
      const shop = await update('shop', (list) => [...list, item])
      return json(200, { item, shop })
    }
    const sh = route.match(/^shop\/([\w-]+)(\/delete)?$/)
    if (sh) {
      let found: StoreItem | undefined
      const shop = await update('shop', (list) => {
        const i = list.findIndex((it) => it.id === sh[1])
        if (i < 0) throw new InputError('That item no longer exists.')
        if (sh[2]) return list.filter((_, j) => j !== i)
        found = itemFields(body, list[i])
        return list.map((it, j) => (j === i ? found! : it))
      })
      return json(200, { item: found ?? null, shop })
    }
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }

  return json(404, { error: 'Not found.' })
}
