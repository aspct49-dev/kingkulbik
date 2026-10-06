/*
 * Player profiles, originals bet history and Item Store redemptions.
 *
 * A profile is written when someone signs in or links an account, and kept
 * fresh as they use the site. Bets are recorded by server/originals.ts for
 * signed-in players (guests stay anonymous). Redemptions are requests: points
 * still come off by hand in BotRix until the Premium API key is set, so an
 * admin fulfils (or rejects) each one.
 *
 *   GET  /api/profile                    your profile, bets and redemptions
 *   POST /api/shop/redeem                { itemId }
 *   GET  /api/shop/stats                 most redeemed, points spent, items sold
 *   GET  /api/admin/players?q=           players, most recently seen first
 *   GET  /api/admin/players/<id>         one player's profile, bets and redemptions
 *   GET  /api/admin/redemptions          every redemption, newest first
 *   POST /api/admin/redemptions/<id>     { status: 'fulfilled' | 'rejected', note? }
 */

import { randomBytes } from 'node:crypto'
import type { PlayerBet, PlayerProfile, ProfileView, Redemption } from '../shared/profiles.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse, SessionUser } from './auth.js'
import { getBotrixViewer } from './botrix.js'
import { lookupStakePlayer } from './stakeLink.js'
import { read, StoreError, update } from './store.js'

/** History kept across all players (oldest drop out first) */
const BET_HISTORY = 20_000
const SEEN_EVERY_MS = 10 * 60_000

class InputError extends Error {}

/** Create or refresh the signed-in player's profile (skips the write when nothing changed lately) */
export async function touchProfile(user: SessionUser): Promise<PlayerProfile> {
  const now = Date.now()
  const players = await read('players')
  const current = players.find((p) => p.id === user.discord.id)
  const next: PlayerProfile = {
    id: user.discord.id,
    name: user.discord.name,
    username: user.discord.username,
    avatar: user.discord.avatar,
    kick: user.kick,
    stake: user.stake ? { username: user.stake.username } : null,
    firstSeen: current?.firstSeen ?? now,
    lastSeen: now,
    bets: current?.bets ?? 0,
    wagered: current?.wagered ?? 0,
    paid: current?.paid ?? 0,
  }
  const unchanged =
    current &&
    now - current.lastSeen < SEEN_EVERY_MS &&
    JSON.stringify({ ...current, lastSeen: 0 }) === JSON.stringify({ ...next, lastSeen: 0 })
  if (unchanged) return current
  try {
    await update('players', (list) => [next, ...list.filter((p) => p.id !== next.id)])
  } catch {
    /* Read-only host: the profile just isn't remembered */
  }
  return next
}

/** Add a settled original to the player's history and totals */
export async function recordPlayerBet(user: SessionUser, bet: Omit<PlayerBet, 'id' | 'userId' | 'at'>) {
  const entry: PlayerBet = { ...bet, id: randomBytes(6).toString('hex'), userId: user.discord.id, at: Date.now() }
  try {
    await touchProfile(user)
    await update('bets', (list) => [entry, ...list].slice(0, BET_HISTORY))
    await update('players', (list) =>
      list.map((p) =>
        p.id === user.discord.id
          ? {
              ...p,
              bets: p.bets + 1,
              wagered: Math.round((p.wagered + bet.bet) * 100) / 100,
              paid: Math.round((p.paid + bet.payout) * 100) / 100,
            }
          : p,
      ),
    )
  } catch {
    /* Best effort, like the public feed */
  }
}

async function view(id: string, betLimit: number, env: AuthEnv): Promise<ProfileView | null> {
  const [players, bets, redemptions] = await Promise.all([read('players'), read('bets'), read('redemptions')])
  const profile = players.find((p) => p.id === id)
  if (!profile) return null
  let wagered: number | null = null
  if (profile.stake) {
    wagered = await lookupStakePlayer(profile.stake.username, env.STAKE_API_TOKEN, env.STAKE_API_BASE)
      .then((p) => p?.wagered ?? 0)
      .catch(() => null)
  }
  return {
    profile,
    bets: bets.filter((b) => b.userId === id).slice(0, betLimit),
    redemptions: redemptions.filter((r) => r.userId === id),
    wagered,
  }
}

export async function handleProfileRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  const mine = path === '/api/profile' || path.startsWith('/api/shop/')
  const adminRoute = /^\/api\/admin\/(players|redemptions)(\/|$)/.test(path)
  if (!mine && !adminRoute) return null
  const user = readSession(req, env)

  try {
    if (path === '/api/shop/stats') {
      const done = (await read('redemptions')).filter((r) => r.status === 'fulfilled')
      const counts = new Map<string, { name: string; image?: string; count: number }>()
      for (const r of done) {
        const c = counts.get(r.itemId) ?? { name: r.itemName, image: r.itemImage, count: 0 }
        c.count += 1
        counts.set(r.itemId, c)
      }
      const most = [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null
      const biggest = done.reduce<Redemption | null>((top, r) => (!top || r.price > top.price ? r : top), null)
      return json(200, {
        mostRedeemed: most ? { name: most.name, image: most.image ?? null } : null,
        biggestPurchase: biggest ? { name: biggest.itemName, image: biggest.itemImage ?? null } : null,
        totalSpent: done.reduce((s, r) => s + r.price, 0),
        itemsSold: done.length,
      })
    }

    if (path === '/api/profile') {
      if (!user) return json(200, { view: null })
      await touchProfile(user)
      return json(200, { view: await view(user.discord.id, 100, env) })
    }

    if (path === '/api/shop/redeem') {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) return json(401, { error: 'Sign in with Discord first.' })
      if (!user.kick) return json(403, { error: 'Link your Kick account first: King Points live there.' })
      let itemId = ''
      try {
        itemId = String((JSON.parse(req.body || '{}') as { itemId?: unknown }).itemId ?? '')
      } catch {
        throw new InputError('Pick an item.')
      }
      const item = (await read('shop')).find((i) => i.id === itemId && !i.hidden)
      if (!item) throw new InputError('That item is no longer in the store.')
      if (item.stock === 0) throw new InputError(`${item.name} is sold out.`)

      // Points still waiting on an admin count as spent
      const pending = (await read('redemptions'))
        .filter((r) => r.userId === user.discord.id && r.status === 'pending')
        .reduce((s, r) => s + r.price, 0)
      const viewer = await getBotrixViewer(user.kick.username).catch(() => {
        throw new InputError('Could not reach BotRix to check your points. Please try again.')
      })
      const available = (viewer?.points ?? 0) - pending
      if (available < item.price) {
        throw new InputError(
          pending
            ? `You need ${item.price.toLocaleString('en-US')} King Points; ${Math.max(0, available).toLocaleString('en-US')} are free after your pending requests.`
            : `You need ${(item.price - available).toLocaleString('en-US')} more King Points.`,
        )
      }

      // Hold one from stock until an admin decides
      await update('shop', (list) => {
        const it = list.find((i) => i.id === item.id)
        if (!it || it.stock === 0) throw new InputError(`${item.name} is sold out.`)
        if (it.stock !== null) it.stock -= 1
        return list
      })
      await touchProfile(user)
      const redemption: Redemption = {
        id: randomBytes(6).toString('hex'),
        userId: user.discord.id,
        player: user.discord.name,
        kick: user.kick.username,
        itemId: item.id,
        itemName: item.name,
        ...(item.image ? { itemImage: item.image } : {}),
        tier: item.tier,
        price: item.price,
        status: 'pending',
        at: Date.now(),
        decidedAt: null,
      }
      await update('redemptions', (list) => [redemption, ...list])
      return json(200, { redemption })
    }

    // ---- admin
    if (!isAdmin(user, env)) return json(user ? 403 : 401, { error: 'Admins only.' })

    if (path === '/api/admin/players') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      const players = (await read('players'))
        .filter(
          (p) =>
            !q ||
            [p.name, p.username, p.id, p.kick?.username, p.stake?.username].some((v) => v?.toLowerCase().includes(q)),
        )
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 200)
      return json(200, { players })
    }

    const one = path.match(/^\/api\/admin\/players\/(\d{5,25})$/)
    if (one) {
      const v = await view(one[1], 500, env)
      return v ? json(200, { view: v }) : json(404, { error: 'No player with that id.' })
    }

    if (path === '/api/admin/redemptions') return json(200, { redemptions: await read('redemptions') })

    const decide = path.match(/^\/api\/admin\/redemptions\/([\w-]+)$/)
    if (decide) {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      let body: { status?: unknown; note?: unknown } = {}
      try {
        body = JSON.parse(req.body || '{}')
      } catch {
        throw new InputError('Send a JSON object.')
      }
      const status = body.status
      if (status !== 'fulfilled' && status !== 'rejected' && status !== 'pending') {
        throw new InputError('Status is fulfilled, rejected or pending.')
      }
      let before: Redemption | undefined
      const redemptions = await update('redemptions', (list) => {
        const r = list.find((x) => x.id === decide[1])
        if (!r) throw new InputError('That redemption no longer exists.')
        before = { ...r }
        r.status = status
        r.decidedAt = status === 'pending' ? null : Date.now()
        const note = String(body.note ?? '').trim().slice(0, 200)
        if (note) r.note = note
        else delete r.note
        return list
      })
      // A rejected request gives its stock back (and takes it again if reopened)
      const wasHeld = before!.status !== 'rejected'
      const isHeld = status !== 'rejected'
      if (wasHeld !== isHeld) {
        await update('shop', (list) =>
          list.map((i) => (i.id === before!.itemId && i.stock !== null ? { ...i, stock: Math.max(0, i.stock + (isHeld ? -1 : 1)) } : i)),
        )
      }
      return json(200, { redemptions, shop: await read('shop') })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
