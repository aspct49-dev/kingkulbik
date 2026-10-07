/*
 * Admin unlinks of a player's Stake username.
 *
 * The link lives in the player's signed session cookie, which only their
 * browser holds, so an unlink is recorded here (Discord id → when) and applied
 * on the player's next request: a link made before the unlink is dropped and
 * the cookie is rewritten without it. Linking again afterwards works as usual.
 */

import type { AuthEnv, AuthRequest, SessionUser } from './auth.js'
import { cookie, origin, parseCookies, readSession, seal, SESSION_COOKIE, SESSION_DAYS } from './auth.js'
import { read, update } from './store.js'

const CACHE_MS = 15_000
let cache: { at: number; unlinks: Record<string, number> } | null = null

async function unlinks() {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), unlinks: await read('stakeUnlinks') }
  return cache.unlinks
}

/** Remove a player's Stake link (admin): from their profile now, from their cookie on their next visit */
export async function unlinkStake(discordId: string) {
  const at = Math.floor(Date.now() / 1000)
  const next = await update('stakeUnlinks', (all) => ({ ...all, [discordId]: at }))
  cache = { at: Date.now(), unlinks: next }
  await update('players', (players) => players.map((p) => (p.id === discordId ? { ...p, stake: null } : p)))
}

/**
 * Before a request is handled: if its session carries a Stake link an admin
 * has since removed, drop it from the request and return the cookie that
 * replaces the player's session (null when nothing changed).
 */
export async function applyStakeUnlink(req: AuthRequest, env: AuthEnv): Promise<string | null> {
  const user = readSession(req, env)
  if (!user?.stake || !env.SESSION_SECRET) return null
  const unlinkedAt = (await unlinks().catch(() => ({}) as Record<string, number>))[user.discord.id]
  if (!unlinkedAt || user.stake.linkedAt > unlinkedAt) return null

  const session: SessionUser = { ...user, stake: null }
  const sealed = seal(session, env.SESSION_SECRET)
  const cookies = parseCookies(req.cookie)
  cookies[SESSION_COOKIE] = sealed
  req.cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ')
  return cookie(SESSION_COOKIE, sealed, SESSION_DAYS * 86400, origin(req, env).startsWith('https://'))
}
