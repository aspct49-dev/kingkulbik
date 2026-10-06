/*
 * The Item Store pipeline (modelled on au-slots) and the admin points panel.
 *
 * Buying takes the King Points straight away through BotRix and holds one
 * item from stock; the request then waits for an admin. Approving delivers it.
 * Rejecting (with a reason the player sees) or the player cancelling gives
 * the points back and returns the stock. A request is claimed before any
 * refund, so a double click can't refund twice, and a refund that fails puts
 * the request back to pending, so nobody loses points.
 *
 *   GET  /api/shop/stats                       most redeemed, points spent, items sold
 *   POST /api/shop/redeem                      { itemId }
 *   POST /api/shop/redemptions/<id>/cancel     the player's own pending request
 *   GET  /api/admin/redemptions                every request, newest first
 *   POST /api/admin/redemptions/<id>           { action: 'approve' } | { action: 'reject', reason }
 *   GET  /api/admin/points?name=               a viewer's BotRix points, linked player, recent changes
 *   POST /api/admin/points                     { name, delta, reason }
 *   GET  /api/admin/points/log                 the last changes made from the site
 *   GET  /api/admin/shop-settings · POST { cooldownDays }
 */

import { randomBytes } from 'node:crypto'
import type { PointsLogEntry, Redemption } from '../shared/profiles.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { adjustBotrixPoints, BotrixError, getBotrixViewer } from './botrix.js'
import { touchProfile } from './profiles.js'
import { read, StoreError, update } from './store.js'

class InputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const LOG_SIZE = 2000
const DAY = 86_400_000
const KICK_NAME = /^[A-Za-z0-9_]{2,25}$/

const parse = (body: string | undefined): Record<string, unknown> => {
  try {
    const v = JSON.parse(body || '{}') as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* falls through */
  }
  throw new InputError('Send a JSON object.')
}

async function log(entry: Omit<PointsLogEntry, 'id' | 'at'>) {
  const row: PointsLogEntry = { ...entry, id: randomBytes(6).toString('hex'), at: Date.now() }
  await update('pointsLog', (list) => [row, ...list].slice(0, LOG_SIZE)).catch((err) => console.error('[shop] log failed:', err))
}

const restock = (itemId: string, by: 1 | -1) =>
  update('shop', (list) =>
    list.map((i) => (i.id === itemId && i.stock !== null ? { ...i, stock: Math.max(0, i.stock + by) } : i)),
  )

/**
 * Give a request's points back and close it as rejected or cancelled.
 * Claims it first (pending only); if BotRix refuses the refund it goes back to pending.
 */
async function closeWithRefund(id: string, status: 'rejected' | 'cancelled', by: string, env: AuthEnv, reason = '', ownerId?: string) {
  let claimed: Redemption | undefined
  await update('redemptions', (list) => {
    const r = list.find((x) => x.id === id)
    if (!r) throw new InputError('That request no longer exists.', 404)
    if (ownerId && r.userId !== ownerId) throw new InputError('That isn’t your request.', 403)
    if (r.status !== 'pending') throw new InputError('This request was already handled. Refresh to see it.', 409)
    r.status = status
    r.decidedAt = Date.now()
    if (status === 'rejected') {
      r.handledBy = by
      r.note = reason.trim().slice(0, 200) || 'No reason given'
    }
    claimed = { ...r }
    return list
  })
  const r = claimed!

  if (r.charged) {
    try {
      await adjustBotrixPoints(r.kick, r.price, env.BOTRIX_BID)
      await log({ kick: r.kick, delta: r.price, kind: 'refund', reason: `${status === 'cancelled' ? 'Cancelled' : 'Rejected'}: ${r.itemName}`, by, ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refund failed.'
      await log({ kick: r.kick, delta: r.price, kind: 'refund', reason: `Refund for ${r.itemName}`, by, ok: false, error: message })
      // Not refunded: back to pending so the points aren't lost
      await update('redemptions', (list) =>
        list.map((x) => (x.id === id ? { ...x, status: 'pending' as const, decidedAt: null, handledBy: undefined, note: undefined } : x)),
      )
      throw new InputError(`Couldn’t give the points back (${message}), so the request is still pending. Try again.`, 502)
    }
  }
  await update('redemptions', (list) => list.map((x) => (x.id === id ? { ...x, refunded: Boolean(r.charged) } : x)))
  await restock(r.itemId, 1)
}

export async function handleShopRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  const isShop = path.startsWith('/api/shop/')
  const isAdminRoute = /^\/api\/admin\/(redemptions|points|shop-settings)(\/|$)/.test(path)
  if (!isShop && !isAdminRoute) return null
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

    // ---- buying
    if (path === '/api/shop/redeem') {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) return json(401, { error: 'Sign in with Discord first.' })
      if (!user.kick) return json(403, { error: 'Link your Kick account first: King Points live there.' })
      const kick = user.kick.username
      const itemId = String(parse(req.body).itemId ?? '')
      const item = (await read('shop')).find((i) => i.id === itemId && !i.hidden)
      if (!item) throw new InputError('That item is no longer in the store.', 404)
      if (item.stock === 0) throw new InputError(`${item.name} is sold out.`, 409)

      // One purchase per cooldown (rejected and cancelled ones don't count); admins aren't limited
      const { cooldownDays } = await read('shopSettings')
      if (cooldownDays > 0 && !isAdmin(user, env)) {
        const last = (await read('redemptions'))
          .filter((r) => r.userId === user.discord.id && (r.status === 'pending' || r.status === 'fulfilled'))
          .sort((a, b) => b.at - a.at)[0]
        const wait = last ? last.at + cooldownDays * DAY - Date.now() : 0
        if (wait > 0) {
          const days = Math.ceil(wait / DAY)
          throw new InputError(`You can buy again in ${days} day${days === 1 ? '' : 's'}: one item every ${cooldownDays} days.`, 429)
        }
      }

      const viewer = await getBotrixViewer(kick, true).catch(() => {
        throw new InputError('Could not reach BotRix to check your points. Please try again.', 502)
      })
      const balance = viewer?.points ?? 0
      if (balance < item.price) {
        throw new InputError(`You need ${(item.price - balance).toLocaleString('en-US')} more King Points.`, 402)
      }

      // Hold one from stock, then take the points; if BotRix says no, the stock goes back
      await update('shop', (list) => {
        const it = list.find((i) => i.id === item.id)
        if (!it || it.stock === 0) throw new InputError(`${item.name} is sold out.`, 409)
        if (it.stock !== null) it.stock -= 1
        return list
      })
      try {
        await adjustBotrixPoints(kick, -item.price, env.BOTRIX_BID)
      } catch (err) {
        await restock(item.id, 1)
        const message = err instanceof Error ? err.message : 'Could not take the points.'
        await log({ kick, delta: -item.price, kind: 'redeem', reason: item.name, by: user.discord.name, ok: false, error: message })
        throw new InputError(err instanceof BotrixError && err.code === 'insufficient' ? 'You don’t have enough King Points.' : message, 502)
      }
      await log({ kick, delta: -item.price, kind: 'redeem', reason: item.name, by: user.discord.name, ok: true })

      const redemption: Redemption = {
        id: randomBytes(6).toString('hex'),
        userId: user.discord.id,
        player: user.discord.name,
        kick,
        itemId: item.id,
        itemName: item.name,
        ...(item.image ? { itemImage: item.image } : {}),
        tier: item.tier,
        price: item.price,
        status: 'pending',
        at: Date.now(),
        decidedAt: null,
        charged: true,
      }
      try {
        await update('redemptions', (list) => [redemption, ...list])
      } catch (err) {
        // Couldn't record it: undo the charge and the stock hold
        await adjustBotrixPoints(kick, item.price, env.BOTRIX_BID).catch(() => undefined)
        await restock(item.id, 1).catch(() => undefined)
        throw err
      }
      await touchProfile(user)
      return json(200, { redemption, points: Math.max(0, balance - item.price) })
    }

    const cancel = path.match(/^\/api\/shop\/redemptions\/([\w-]+)\/cancel$/)
    if (cancel) {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      if (!user) return json(401, { error: 'Sign in with Discord first.' })
      await closeWithRefund(cancel[1], 'cancelled', user.discord.name, env, '', user.discord.id)
      const viewer = user.kick ? await getBotrixViewer(user.kick.username, true).catch(() => null) : null
      return json(200, { redemptions: (await read('redemptions')).filter((r) => r.userId === user.discord.id), points: viewer?.points ?? null })
    }

    if (isShop) return json(404, { error: 'Not found.' })

    // ---- admin
    if (!isAdmin(user, env)) return json(user ? 403 : 401, { error: 'Admins only.' })
    const admin = user!.discord.name

    if (path === '/api/admin/redemptions') return json(200, { redemptions: await read('redemptions') })

    const decide = path.match(/^\/api\/admin\/redemptions\/([\w-]+)$/)
    if (decide) {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      const body = parse(req.body)
      if (body.action === 'approve') {
        await update('redemptions', (list) => {
          const r = list.find((x) => x.id === decide[1])
          if (!r) throw new InputError('That request no longer exists.', 404)
          if (r.status !== 'pending') throw new InputError('This request was already handled. Refresh to see it.', 409)
          r.status = 'fulfilled'
          r.decidedAt = Date.now()
          r.handledBy = admin
          return list
        })
      } else if (body.action === 'reject') {
        await closeWithRefund(decide[1], 'rejected', admin, env, String(body.reason ?? ''))
      } else throw new InputError('Approve or reject.')
      return json(200, { redemptions: await read('redemptions'), shop: await read('shop') })
    }

    if (path === '/api/admin/points/log') return json(200, { log: (await read('pointsLog')).slice(0, 300) })

    if (path === '/api/admin/points') {
      if (req.method === 'GET') {
        const name = (url.searchParams.get('name') ?? '').trim()
        if (!KICK_NAME.test(name)) throw new InputError('Enter a Kick username.')
        const viewer = await getBotrixViewer(name, true).catch(() => {
          throw new InputError('Could not reach BotRix.', 502)
        })
        const player = (await read('players')).find((p) => p.kick?.username.toLowerCase() === name.toLowerCase()) ?? null
        const history = (await read('pointsLog')).filter((e) => e.kick.toLowerCase() === name.toLowerCase()).slice(0, 50)
        return json(200, { viewer, player, history })
      }
      if (req.method !== 'POST') return json(405, { error: 'Use GET or POST.' })
      const body = parse(req.body)
      const name = String(body.name ?? '').trim()
      const delta = Number(body.delta)
      const reason = String(body.reason ?? '').trim().slice(0, 120)
      if (!KICK_NAME.test(name)) throw new InputError('Enter a Kick username.')
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000_000) {
        throw new InputError('Enter a whole number of points (up to 10,000,000).')
      }
      try {
        await adjustBotrixPoints(name, delta, env.BOTRIX_BID)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'BotRix didn’t make the change.'
        await log({ kick: name, delta, kind: 'admin', reason, by: admin, ok: false, error: message })
        throw new InputError(message, 502)
      }
      await log({ kick: name, delta, kind: 'admin', reason, by: admin, ok: true })
      // BotRix's leaderboard can lag a moment behind the change
      const viewer = await getBotrixViewer(name, true).catch(() => null)
      return json(200, { viewer, history: (await read('pointsLog')).filter((e) => e.kick.toLowerCase() === name.toLowerCase()).slice(0, 50) })
    }

    if (path === '/api/admin/shop-settings') {
      if (req.method === 'POST') {
        const days = Number(parse(req.body).cooldownDays)
        if (!Number.isInteger(days) || days < 0 || days > 365) throw new InputError('Cooldown is 0 to 365 days.')
        await update('shopSettings', () => ({ cooldownDays: days }))
      }
      return json(200, { settings: await read('shopSettings') })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(err.status, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
