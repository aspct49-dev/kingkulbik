/*
 * Player profiles and originals bet history.
 *
 * A profile is written when someone signs in or links an account, and kept
 * fresh as they use the site. Bets are recorded by server/originals.ts for
 * signed-in players (guests stay anonymous). The Item Store and King Points
 * are in server/shop.ts.
 *
 *   GET  /api/profile                    your profile, bets and redemptions
 *   GET  /api/admin/players?q=           players, most recently seen first
 *   GET  /api/admin/players/<id>         one player's profile, bets and redemptions
 *   POST /api/admin/players/<id>/unlink-stake   remove their Stake link
 */

import { randomBytes } from 'node:crypto'
import type { PlayerBet, PlayerProfile, ProfileView } from '../shared/profiles.js'
import { accountId, displayName, userAvatar } from './accounts.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse, SessionUser } from './auth.js'
import { lookupStakePlayer } from './stakeLink.js'
import { unlinkStake } from './stakeUnlinks.js'
import { read, StoreError, update } from './store.js'

/** History kept across all players (oldest drop out first) */
const BET_HISTORY = 20_000
const SEEN_EVERY_MS = 10 * 60_000

class InputError extends Error {}

/** Create or refresh the signed-in player's profile (skips the write when nothing changed lately) */
export async function touchProfile(user: SessionUser): Promise<PlayerProfile> {
  const now = Date.now()
  const players = await read('players')
  const id = accountId(user)
  const current = players.find((p) => p.id === id)
  const next: PlayerProfile = {
    id,
    discordId: user.discord?.id ?? null,
    name: displayName(user),
    username: user.discord?.username ?? user.kick?.username ?? '',
    avatar: userAvatar(user),
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
  const entry: PlayerBet = { ...bet, id: randomBytes(6).toString('hex'), userId: accountId(user), at: Date.now() }
  try {
    await touchProfile(user)
    await update('bets', (list) => [entry, ...list].slice(0, BET_HISTORY))
    await update('players', (list) =>
      list.map((p) =>
        p.id === accountId(user)
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
  const mine = path === '/api/profile'
  const adminRoute = /^\/api\/admin\/players(\/|$)/.test(path)
  if (!mine && !adminRoute) return null
  const user = readSession(req, env)

  try {
    if (path === '/api/profile') {
      if (!user) return json(200, { view: null })
      await touchProfile(user)
      return json(200, { view: await view(accountId(user), 100, env) })
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

    // Remove a player's Stake link (their cookie drops it on their next visit)
    const unlink = path.match(/^\/api\/admin\/players\/(\d{5,25}|kick-\d{1,20})\/unlink-stake$/)
    if (unlink) {
      if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
      await unlinkStake(unlink[1])
      const v = await view(unlink[1], 500, env)
      return v ? json(200, { view: v }) : json(404, { error: 'No player with that id.' })
    }

    const one = path.match(/^\/api\/admin\/players\/(\d{5,25}|kick-\d{1,20})$/)
    if (one) {
      const v = await view(one[1], 500, env)
      return v ? json(200, { view: v }) : json(404, { error: 'No player with that id.' })
    }

    return json(404, { error: 'Not found.' })
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message })
    if (err instanceof StoreError) return json(503, { error: err.message })
    throw err
  }
}
