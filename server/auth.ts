/*
 * Sign in with Discord, link a Kick account.
 *
 * No database yet, so the session is a signed cookie: the payload is readable
 * JSON, and an HMAC over it with SESSION_SECRET means nobody can edit it (a
 * changed byte fails the check and the cookie is ignored). When the database
 * lands, the cookie shrinks to a session id and accounts move to tables; the
 * routes and the page stay as they are.
 *
 * Routes (served by api/auth.ts on Vercel and by the Vite dev server locally):
 *   GET  /api/auth/me                  → { user } or { user: null }
 *   GET  /api/auth/discord/login       → redirect to Discord
 *   GET  /api/auth/discord/callback    → sign in, back to the page
 *   GET  /api/auth/kick/login          → redirect to Kick (signed in only)
 *   GET  /api/auth/kick/callback       → link Kick, back to /account
 *   POST /api/auth/logout              → clear the session
 *   GET  /api/auth/points              → the linked Kick account's BotRix points
 *   POST /api/auth/stake {username}    → link a Stake username under the code
 *   GET  /api/auth/stake/progress      → the linked Stake account's wager
 *
 * Kick is OAuth 2.1, so it uses PKCE: the verifier is parked in a signed
 * cookie and sent back at the token exchange. Endpoints as in the Fugroo app.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getBotrixViewer } from './botrix.js'
import { lookupStakePlayer, StakeLinkError, validStakeName } from './stakeLink.js'

export type AuthEnv = {
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  KICK_CLIENT_ID?: string
  KICK_CLIENT_SECRET?: string
  SESSION_SECRET?: string
  /** Pin the public origin (e.g. https://kingkulbik.com); otherwise taken from the request */
  AUTH_URL?: string
  STAKE_API_TOKEN?: string
  /** Override the Stake API origin (e.g. a local mock for testing) */
  STAKE_API_BASE?: string
  /** Discord user ids allowed into the admin panel (comma or space separated) */
  ADMIN_DISCORD_IDS?: string
  /** BotRix bid token: adds and takes King Points (server/botrix.ts) */
  BOTRIX_BID?: string
}

export type SessionUser = {
  discord: { id: string; username: string; name: string; avatar: string | null }
  kick: { id: string; username: string } | null
  /** Stake username under the code (checked against the affiliate API when linked) */
  stake?: { username: string; linkedAt: number } | null
  /** Unix seconds */
  signedInAt: number
}

export type AuthRequest = {
  method: string
  /** Path and query, e.g. /api/auth/discord/callback?code=… */
  url: string
  cookie: string | undefined
  host: string | undefined
  /** x-forwarded-proto, when behind a proxy */
  proto: string | undefined
  /** Request body (JSON), for POSTs */
  body?: string
}

export type AuthResponse = {
  status: number
  headers: Record<string, string | string[]>
  body?: string | Buffer
}

/** The signed-in user from the session cookie, or null */
export function readSession(req: AuthRequest, env: AuthEnv): SessionUser | null {
  if (!env.SESSION_SECRET) return null
  return unseal<SessionUser>(parseCookies(req.cookie)[SESSION_COOKIE], env.SESSION_SECRET)
}

/** Admins come from ADMIN_DISCORD_IDS, checked on every request (no stored roles) */
export function isAdmin(user: SessionUser | null, env: AuthEnv) {
  if (!user) return false
  const ids = (env.ADMIN_DISCORD_IDS ?? '').split(/[\s,]+/).filter((id) => /^\d{5,25}$/.test(id))
  return ids.includes(user.discord.id)
}

export const SESSION_COOKIE = 'kk_session'
const STATE_COOKIE = 'kk_oauth'
const SESSION_DAYS = 30
const STATE_MINUTES = 10

const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/users/@me'

const KICK_AUTHORIZE = 'https://id.kick.com/oauth/authorize'
const KICK_TOKEN = 'https://id.kick.com/oauth/token'
const KICK_USERS = 'https://api.kick.com/public/v1/users'
/* Kick sits behind Cloudflare, which turns away requests without a browser-like UA */
const KICK_UA = 'Mozilla/5.0'

// ---------------------------------------------------------------- cookies

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url')

/** base64url(JSON).signature */
export function seal(value: unknown, secret: string) {
  const data = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${data}.${sign(data, secret)}`
}

export function unseal<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 1) return null
  const data = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(data, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- helpers

type OAuthState = {
  provider: 'discord' | 'kick'
  state: string
  /** PKCE verifier (Kick) */
  verifier?: string
  /** Where to land afterwards (a same-site path) */
  returnTo: string
  /** Unix seconds */
  expires: number
}

const now = () => Math.floor(Date.now() / 1000)

export function origin(req: AuthRequest, env: AuthEnv) {
  if (env.AUTH_URL) return env.AUTH_URL.replace(/\/+$/, '')
  const host = req.host ?? 'localhost:5173'
  const proto = req.proto?.split(',')[0].trim() || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Only same-site paths, so the login can't be used to bounce people elsewhere */
function safeReturn(value: string | null, fallback: string) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

const redirect = (location: string, cookies: string[] = []): AuthResponse => ({
  status: 302,
  headers: { Location: location, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) },
})

export const json = (status: number, body: unknown, cookies: string[] = []): AuthResponse => ({
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  },
  body: JSON.stringify(body),
})

/** Back to the page with ?auth_error=… so it can say what went wrong */
function failBack(returnTo: string, message: string, cookies: string[] = []) {
  const url = new URL(returnTo, 'http://x')
  url.searchParams.set('auth_error', message)
  return redirect(url.pathname + url.search, cookies)
}

// ---------------------------------------------------------------- handler

export async function handleAuthRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const url = new URL(req.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/auth/')) return null

  const secret = env.SESSION_SECRET
  if (!secret || secret.length < 32) return json(500, { error: 'Sign-in is not configured (SESSION_SECRET).' })

  const base = origin(req, env)
  const secure = base.startsWith('https://')
  const cookies = parseCookies(req.cookie)
  const user = unseal<SessionUser>(cookies[SESSION_COOKIE], secret)
  const clearState = cookie(STATE_COOKIE, '', 0, secure)
  const route = url.pathname.slice('/api/auth/'.length)

  if (route === 'me') return json(200, { user, admin: isAdmin(user, env) })

  if (route === 'stake') {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    if (!user) return json(401, { error: 'Sign in with Discord first.' })
    // Changing a linked name goes through an admin, like Kick
    if (user.stake) return json(409, { error: 'You already linked a Stake account. Ask in the Discord to change it.' })
    let name = ''
    try {
      name = String((JSON.parse(req.body || '{}') as { username?: unknown }).username ?? '').trim()
    } catch {
      return json(400, { error: 'Send a username.' })
    }
    if (!validStakeName(name)) return json(400, { error: 'Enter your Stake username (letters, numbers and _).' })
    try {
      const player = await lookupStakePlayer(name, env.STAKE_API_TOKEN, env.STAKE_API_BASE)
      if (!player) {
        return json(404, {
          error: `We couldn't find ${name} under code KINGKULBIK. Register with the code and place a bet, then try again.`,
        })
      }
      const session: SessionUser = { ...user, stake: { username: player.username, linkedAt: now() } }
      return json(200, { user: session, wagered: player.wagered }, [
        cookie(SESSION_COOKIE, seal(session, secret), SESSION_DAYS * 86400, secure),
      ])
    } catch (err) {
      const status = err instanceof StakeLinkError ? err.status : 502
      console.error('[auth] Stake link failed:', err)
      return json(status, { error: err instanceof Error ? err.message : 'Could not reach Stake.' })
    }
  }

  if (route === 'stake/progress') {
    if (!user?.stake) return json(200, { wagered: null })
    try {
      const player = await lookupStakePlayer(user.stake.username, env.STAKE_API_TOKEN, env.STAKE_API_BASE)
      return json(200, { username: user.stake.username, wagered: player?.wagered ?? 0, underCode: Boolean(player) })
    } catch (err) {
      console.error('[auth] Stake progress failed:', err)
      return json(502, { error: 'Could not reach Stake.' })
    }
  }

  if (route === 'points') {
    if (!user?.kick) return json(200, { points: null })
    try {
      const viewer = await getBotrixViewer(user.kick.username)
      return json(200, {
        points: viewer?.points ?? 0,
        watchtime: viewer?.watchtime ?? 0,
        level: viewer?.level ?? 0,
        known: Boolean(viewer),
      })
    } catch (err) {
      console.error('[auth] BotRix lookup failed:', err)
      return json(502, { error: 'Could not reach BotRix.' })
    }
  }

  if (route === 'logout') {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    return json(200, { user: null }, [cookie(SESSION_COOKIE, '', 0, secure)])
  }

  // ---- Discord: sign in
  if (route === 'discord/login') {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET)
      return json(500, { error: 'Discord sign-in is not configured.' })
    const state: OAuthState = {
      provider: 'discord',
      state: randomBytes(16).toString('base64url'),
      returnTo: safeReturn(url.searchParams.get('return'), '/account'),
      expires: now() + STATE_MINUTES * 60,
    }
    const authorize = new URL(DISCORD_AUTHORIZE)
    authorize.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('redirect_uri', `${base}/api/auth/discord/callback`)
    authorize.searchParams.set('scope', 'identify')
    authorize.searchParams.set('state', state.state)
    return redirect(authorize.toString(), [cookie(STATE_COOKIE, seal(state, secret), STATE_MINUTES * 60, secure)])
  }

  if (route === 'discord/callback') {
    const saved = unseal<OAuthState>(cookies[STATE_COOKIE], secret)
    const returnTo = saved?.returnTo ?? '/account'
    if (url.searchParams.get('error')) return failBack(returnTo, 'Discord sign-in was cancelled.', [clearState])
    if (
      !saved ||
      saved.provider !== 'discord' ||
      saved.expires < now() ||
      saved.state !== url.searchParams.get('state')
    ) {
      return failBack(returnTo, 'That sign-in link expired. Please try again.', [clearState])
    }
    const code = url.searchParams.get('code')
    if (!code || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET)
      return failBack(returnTo, 'Discord sign-in failed.', [clearState])

    try {
      const tokenRes = await fetch(DISCORD_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/auth/discord/callback`,
        }),
      })
      const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null
      if (!tokenRes.ok || !token?.access_token) {
        console.error('[auth] Discord token exchange failed:', tokenRes.status)
        return failBack(returnTo, 'Discord would not sign you in. Please try again.', [clearState])
      }
      const meRes = await fetch(DISCORD_ME, { headers: { Authorization: `Bearer ${token.access_token}` } })
      const me = (await meRes.json().catch(() => null)) as {
        id?: string
        username?: string
        global_name?: string | null
        avatar?: string | null
      } | null
      if (!meRes.ok || !me?.id || !me.username)
        return failBack(returnTo, 'Discord would not say who you are.', [clearState])

      // Signing in again keeps an already-linked Kick account (same Discord id only)
      const session: SessionUser = {
        discord: {
          id: me.id,
          username: me.username,
          name: me.global_name || me.username,
          avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null,
        },
        kick: user?.discord.id === me.id ? user.kick : null,
        stake: user?.discord.id === me.id ? (user.stake ?? null) : null,
        signedInAt: now(),
      }
      return redirect(returnTo, [
        clearState,
        cookie(SESSION_COOKIE, seal(session, secret), SESSION_DAYS * 86400, secure),
      ])
    } catch (err) {
      console.error('[auth] Discord sign-in threw:', err)
      return failBack(returnTo, 'Could not reach Discord. Please try again.', [clearState])
    }
  }

  // ---- Kick: link to the signed-in account
  if (route === 'kick/login') {
    if (!user) return redirect('/account?auth_error=' + encodeURIComponent('Sign in with Discord first.'))
    if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) return json(500, { error: 'Kick linking is not configured.' })
    // One Kick account per site account: changing it later goes through an admin
    if (user.kick) return redirect('/account')
    const verifier = randomBytes(48).toString('base64url')
    const state: OAuthState = {
      provider: 'kick',
      state: randomBytes(16).toString('base64url'),
      verifier,
      returnTo: safeReturn(url.searchParams.get('return'), '/account'),
      expires: now() + STATE_MINUTES * 60,
    }
    const authorize = new URL(KICK_AUTHORIZE)
    authorize.searchParams.set('client_id', env.KICK_CLIENT_ID)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('redirect_uri', `${base}/api/auth/kick/callback`)
    authorize.searchParams.set('scope', 'user:read')
    authorize.searchParams.set('state', state.state)
    authorize.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    authorize.searchParams.set('code_challenge_method', 'S256')
    return redirect(authorize.toString(), [cookie(STATE_COOKIE, seal(state, secret), STATE_MINUTES * 60, secure)])
  }

  if (route === 'kick/callback') {
    const saved = unseal<OAuthState>(cookies[STATE_COOKIE], secret)
    const returnTo = saved?.returnTo ?? '/account'
    if (!user) return failBack('/account', 'Sign in with Discord first.', [clearState])
    if (url.searchParams.get('error')) return failBack(returnTo, 'Kick linking was cancelled.', [clearState])
    if (
      !saved ||
      saved.provider !== 'kick' ||
      !saved.verifier ||
      saved.expires < now() ||
      saved.state !== url.searchParams.get('state')
    ) {
      return failBack(returnTo, 'That link expired. Please try again.', [clearState])
    }
    const code = url.searchParams.get('code')
    if (!code || !env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET)
      return failBack(returnTo, 'Kick linking failed.', [clearState])

    try {
      const tokenRes = await fetch(KICK_TOKEN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': KICK_UA,
        },
        body: new URLSearchParams({
          client_id: env.KICK_CLIENT_ID,
          client_secret: env.KICK_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${base}/api/auth/kick/callback`,
          code_verifier: saved.verifier,
        }),
      })
      const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null
      if (!tokenRes.ok || !token?.access_token) {
        console.error('[auth] Kick token exchange failed:', tokenRes.status)
        return failBack(returnTo, 'Kick would not link your account. Please try again.', [clearState])
      }
      const meRes = await fetch(KICK_USERS, {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'User-Agent': KICK_UA },
      })
      // The endpoint answers with the token's own user, as a one-item list
      const body = (await meRes.json().catch(() => null)) as {
        data?: { user_id?: number; name?: string }[] | { user_id?: number; name?: string }
      } | null
      const me = Array.isArray(body?.data) ? body?.data[0] : body?.data
      if (!meRes.ok || !me?.user_id) return failBack(returnTo, 'Kick would not say who you are.', [clearState])

      const session: SessionUser = {
        ...user,
        kick: { id: String(me.user_id), username: me.name ?? `kick-${me.user_id}` },
      }
      return redirect(returnTo, [
        clearState,
        cookie(SESSION_COOKIE, seal(session, secret), SESSION_DAYS * 86400, secure),
      ])
    } catch (err) {
      console.error('[auth] Kick linking threw:', err)
      return failBack(returnTo, 'Could not reach Kick. Please try again.', [clearState])
    }
  }

  return json(404, { error: 'Not found.' })
}
