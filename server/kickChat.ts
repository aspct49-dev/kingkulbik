/*
 * Kick chat, from Kick's own webhooks: every chat message on the channel is
 * POSTed here by Kick (the "Subscribe to events" scope and the webhook URL
 * https://<site>/api/kick/webhook, set on the site's Kick app). It records
 * who chatted and when, so watch-time raffles can count everyone in chat,
 * not just BotRix's top 100 and people signed in on the site.
 *
 * Kick signs each delivery (RSA SHA-256 over "<message id>.<timestamp>.<body>")
 * with the key at /public/v1/public-key; anything unsigned, stale or repeated
 * is ignored. The subscription is made with the app's own token (client
 * credentials), so the streamer doesn't need to sign in; once connected, it's
 * checked every hour and made again if Kick dropped it.
 *
 *   POST /api/kick/webhook                 Kick → site
 *   GET  /api/admin/kick-chat              connection status
 *   POST /api/admin/kick-chat/connect      subscribe to the channel's chat
 */

import { createVerify } from 'node:crypto'
import { KICK_CHANNEL } from '../shared/events.js'
import type { KickChatStatus } from '../shared/raffles.js'
import { isAdmin, json, readSession } from './auth.js'
import type { AuthEnv, AuthRequest, AuthResponse } from './auth.js'
import { read, update } from './store.js'

const KICK_TOKEN = 'https://id.kick.com/oauth/token'
const KICK_API = 'https://api.kick.com/public/v1'
const UA = 'Mozilla/5.0'
const EVENT = 'chat.message.sent'
/** Deliveries older than this are refused (a replayed message) */
const MAX_AGE_MS = 10 * 60_000
/** Chatters not seen for this long are forgotten */
const KEEP_MS = 60 * 24 * 3600_000
const FLUSH_MS = 30_000

export type Chatter = { name: string; kickId: string; firstSeen: number; lastSeen: number }

// ---------------------------------------------------------------- chatters

let chatters: Map<string, Chatter> | null = null
let loading: Promise<Map<string, Chatter>> | null = null
let dirty = false
let lastEventAt: number | null = null

async function roster() {
  if (chatters) return chatters
  loading ??= read('chatters')
    .then((saved) => (chatters = new Map(Object.entries(saved))))
    .catch(() => (chatters = new Map()))
  return loading
}

async function noteChatter(name: string, kickId: string, at: number) {
  const all = await roster()
  const key = name.toLowerCase()
  const seen = all.get(key)
  all.set(key, { name, kickId, firstSeen: seen?.firstSeen ?? at, lastSeen: Math.max(at, seen?.lastSeen ?? 0) })
  lastEventAt = Date.now()
  dirty = true
}

/** Saved every 30 s at most: one write for a busy chat, not one per message */
async function flush() {
  if (!dirty || !chatters) return
  dirty = false
  const cutoff = Date.now() - KEEP_MS
  for (const [key, c] of chatters) if (c.lastSeen < cutoff) chatters.delete(key)
  const snapshot = Object.fromEntries(chatters)
  await update('chatters', () => snapshot).catch(() => (dirty = true))
  if (lastEventAt) await update('kickChat', (s) => ({ ...s, lastEventAt })).catch(() => undefined)
}

/** Everyone who chatted since `since` (ms), newest first */
export async function chattersSince(since: number): Promise<Chatter[]> {
  return [...(await roster()).values()].filter((c) => c.lastSeen >= since).sort((a, b) => b.lastSeen - a.lastSeen)
}

/** When this viewer last chatted (ms), or null */
export async function lastChatted(name: string) {
  return (await roster()).get(name.toLowerCase())?.lastSeen ?? null
}

// ---------------------------------------------------------------- Kick API

let appToken: { token: string; expires: number } | null = null

async function token(env: AuthEnv) {
  if (appToken && Date.now() < appToken.expires) return appToken.token
  if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) throw new Error('Kick isn’t configured (KICK_CLIENT_ID).')
  const res = await fetch(KICK_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': UA },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
  if (!res.ok || !body?.access_token) throw new Error(`Kick wouldn’t give the app a token (${res.status}).`)
  appToken = { token: body.access_token, expires: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 }
  return appToken.token
}

async function kick<T>(env: AuthEnv, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(KICK_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token(env)}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null
  if (!res.ok || !body) throw new Error(`Kick answered ${res.status}${body?.message ? `: ${body.message}` : ''}.`)
  return body
}

async function broadcasterId(env: AuthEnv) {
  const body = await kick<{ data?: { broadcaster_user_id?: number; slug?: string }[] }>(env, `/channels?slug=${KICK_CHANNEL}`)
  const id = body.data?.find((c) => c.slug?.toLowerCase() === KICK_CHANNEL)?.broadcaster_user_id ?? body.data?.[0]?.broadcaster_user_id
  if (!id) throw new Error(`Kick didn’t find the channel ${KICK_CHANNEL}.`)
  return id
}

/** Subscribe to the channel's chat (once: an existing subscription is kept) */
async function connect(env: AuthEnv) {
  const broadcaster = await broadcasterId(env)
  const list = await kick<{ data?: { id?: string; event?: string }[] }>(env, `/events/subscriptions?broadcaster_user_id=${broadcaster}`)
  let subscriptionId = list.data?.find((s) => s.event === EVENT)?.id ?? null
  if (!subscriptionId) {
    const made = await kick<{ data?: { subscription_id?: string; error?: string }[] }>(env, '/events/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ method: 'webhook', broadcaster_user_id: broadcaster, events: [{ name: EVENT, version: 1 }] }),
    })
    const result = made.data?.[0]
    if (!result?.subscription_id) throw new Error(`Kick refused the subscription${result?.error ? `: ${result.error}` : ''}.`)
    subscriptionId = result.subscription_id
  }
  const now = Date.now()
  await update('kickChat', (s) => ({ ...s, broadcasterId: broadcaster, subscriptionId, connectedAt: s.connectedAt ?? now, checkedAt: now, error: null }))
}

// ---------------------------------------------------------------- signatures

let publicKey: { pem: string; at: number } | null = null

async function kickKey(refresh = false) {
  if (publicKey && !refresh) return publicKey.pem
  const res = await fetch(`${KICK_API}/public-key`, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
  const body = (await res.json().catch(() => null)) as { data?: { public_key?: string } } | null
  if (!res.ok || !body?.data?.public_key) throw new Error(`Kick's public key: ${res.status}`)
  publicKey = { pem: body.data.public_key, at: Date.now() }
  return publicKey.pem
}

const verifyWith = (pem: string, signed: string, signature: string) => {
  try {
    return createVerify('RSA-SHA256').update(signed).verify(pem, signature, 'base64')
  } catch {
    return false
  }
}

async function verified(id: string, timestamp: string, body: string, signature: string) {
  const signed = `${id}.${timestamp}.${body}`
  if (verifyWith(await kickKey(), signed, signature)) return true
  // Kick may have rotated its key: fetch it again (at most every 5 minutes)
  if (publicKey && Date.now() - publicKey.at < 5 * 60_000) return false
  return verifyWith(await kickKey(true), signed, signature)
}

/** Message ids already handled (Kick may deliver one more than once) */
const handled = new Set<string>()

// ---------------------------------------------------------------- routes

export async function handleKickChatRequest(req: AuthRequest, env: AuthEnv): Promise<AuthResponse | null> {
  const path = new URL(req.url, 'http://localhost').pathname

  if (path === '/api/kick/webhook') {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    const h = req.headers ?? {}
    const id = h['kick-event-message-id']
    const timestamp = h['kick-event-message-timestamp']
    const signature = h['kick-event-signature']
    const body = req.body ?? ''
    if (!id || !timestamp || !signature) return json(400, { error: 'Not a Kick event.' })
    const at = Date.parse(timestamp)
    if (!Number.isFinite(at) || Math.abs(Date.now() - at) > MAX_AGE_MS) return json(400, { error: 'Too old.' })
    if (!(await verified(id, timestamp, body, signature).catch(() => false))) return json(401, { error: 'Bad signature.' })
    if (handled.has(id)) return json(200, { ok: true })
    handled.add(id)
    if (handled.size > 5000) handled.delete(handled.values().next().value!)

    if (h['kick-event-type'] === EVENT) {
      try {
        const event = JSON.parse(body) as {
          broadcaster?: { user_id?: number }
          sender?: { user_id?: number; username?: string; is_anonymous?: boolean }
          created_at?: string
        }
        const state = await read('kickChat')
        const ours = !state.broadcasterId || event.broadcaster?.user_id === state.broadcasterId
        const sender = event.sender
        if (ours && sender?.username && sender.user_id && !sender.is_anonymous) {
          const sent = Date.parse(event.created_at ?? '')
          await noteChatter(sender.username, String(sender.user_id), Number.isFinite(sent) ? Math.min(sent, Date.now()) : Date.now())
        }
      } catch {
        /* a malformed event isn't worth an error back to Kick */
      }
    }
    return json(200, { ok: true })
  }

  if (path !== '/api/admin/kick-chat' && path !== '/api/admin/kick-chat/connect') return null
  if (!isAdmin(readSession(req, env), env)) return json(401, { error: 'Admins only.' })

  if (path === '/api/admin/kick-chat/connect') {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    try {
      await connect(env)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Kick.'
      await update('kickChat', (s) => ({ ...s, error: message })).catch(() => undefined)
      return json(502, { error: message })
    }
  }
  return json(200, { status: await status() })
}

async function status(): Promise<KickChatStatus> {
  const state = await read('kickChat')
  const day = await chattersSince(Date.now() - 24 * 3600_000)
  return {
    connected: Boolean(state.subscriptionId),
    connectedAt: state.connectedAt ?? null,
    lastEventAt: lastEventAt ?? state.lastEventAt ?? null,
    chattersToday: day.length,
    error: state.error ?? null,
  }
}

/** On the VPS: save chatters every 30 s, and keep the subscription alive (checked hourly once connected) */
export function startKickChat(env: AuthEnv) {
  setInterval(() => void flush(), FLUSH_MS).unref()
  const check = async () => {
    const state = await read('kickChat').catch(() => null)
    if (!state?.subscriptionId) return
    await connect(env).catch(async (err: Error) => {
      console.error('[kick chat] subscription check failed:', err.message)
      await update('kickChat', (s) => ({ ...s, error: err.message })).catch(() => undefined)
    })
  }
  setInterval(() => void check(), 60 * 60_000).unref()
  void check()
}
