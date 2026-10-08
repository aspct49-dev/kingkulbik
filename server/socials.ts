/*
 * Socials & Video: the Kick channel (live or not, followers) and its recent
 * streams, read from Kick's public API. Kept for a minute so the page never
 * calls Kick more than about once a minute (an older copy is served at once
 * while the next one loads); if Kick can't be reached, the
 * last copy is served (or an empty one, and the page still links to Kick).
 *
 *   GET /api/socials/kick
 */

import { KICK_CHANNEL } from '../shared/events.js'
import type { KickChannelInfo, KickSocials, KickVod } from '../shared/socials.js'
import type { AuthRequest, AuthResponse } from './auth.js'

const KICK_API = `https://kick.com/api/v2/channels/${KICK_CHANNEL}`
const FRESH_MS = 60_000

let cache: KickSocials | null = null
let pending: Promise<KickSocials> | null = null

type Image = { src?: string; srcset?: string } | null | undefined
type RawChannel = {
  followers_count?: number
  offline_banner_image?: Image
  user?: { profile_pic?: string | null }
  livestream?: {
    session_title?: string
    viewer_count?: number
    start_time?: string
    categories?: { name?: string }[]
  } | null
}
type RawVod = {
  session_title?: string
  is_live?: boolean
  duration?: number
  views?: number
  start_time?: string
  thumbnail?: Image
  categories?: { name?: string }[]
  video?: { uuid?: string; views?: number }
}

async function kick<T>(path: string): Promise<T> {
  const res = await fetch(KICK_API + path, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Kick replied ${res.status}`)
  return (await res.json()) as T
}

const https = (url: unknown) => (typeof url === 'string' && url.startsWith('https://') ? url : null)

/** The largest copy in a srcset ("url 1200w, url 1003w, …"); Kick refuses direct links to some originals */
function largest(image: Image) {
  const sizes = (image?.srcset ?? '')
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, w]) => ({ url: https(url), w: parseInt(w ?? '', 10) || 0 }))
    .filter((c) => c.url)
    .sort((a, b) => b.w - a.w)
  return sizes[0]?.url ?? https(image?.src)
}

function toChannel(c: RawChannel): KickChannelInfo {
  const ls = c.livestream
  return {
    followers: Number(c.followers_count) || 0,
    live: ls
      ? {
          title: String(ls.session_title ?? ''),
          viewers: Number(ls.viewer_count) || 0,
          category: ls.categories?.[0]?.name ?? null,
          startedAt: String(ls.start_time ?? ''),
        }
      : null,
    offlineBanner: largest(c.offline_banner_image),
    avatar: https(c.user?.profile_pic),
  }
}

function toVod(v: RawVod): KickVod | null {
  const id = v.video?.uuid
  if (!id || !/^[\w-]{8,64}$/.test(id)) return null
  return {
    id,
    title: String(v.session_title ?? '').trim(),
    thumbnail: https(v.thumbnail?.src),
    durationMs: Number(v.duration) || 0,
    views: Number(v.video?.views ?? v.views) || 0,
    startedAt: String(v.start_time ?? ''),
    category: v.categories?.[0]?.name ?? null,
    live: Boolean(v.is_live),
  }
}

async function load(): Promise<KickSocials> {
  const [channel, vods] = await Promise.allSettled([kick<RawChannel>(''), kick<RawVod[]>('/videos')])
  const next: KickSocials = {
    channel: channel.status === 'fulfilled' ? toChannel(channel.value) : (cache?.channel ?? null),
    vods:
      vods.status === 'fulfilled' && Array.isArray(vods.value)
        ? vods.value.map(toVod).filter((v): v is KickVod => v !== null).slice(0, 24)
        : (cache?.vods ?? []),
    at: Date.now(),
  }
  // Only a copy with something in it replaces the last good one
  if (next.channel || next.vods.length) cache = next
  return cache ?? next
}

/**
 * Whether the stream is live (null: not known yet, or Kick couldn't be
 * reached). Answers from the last copy at once; asks Kick about once a minute.
 */
export async function kickLive(): Promise<boolean | null> {
  if (!cache || Date.now() - cache.at > FRESH_MS) {
    pending ??= load().finally(() => (pending = null))
    if (cache) pending.catch(() => undefined)
    else await pending.catch(() => undefined)
  }
  return cache?.channel ? Boolean(cache.channel.live) : null
}

export async function handleSocialsRequest(req: AuthRequest): Promise<AuthResponse | null> {
  if (!req.url.startsWith('/api/socials/kick')) return null
  if (!cache || Date.now() - cache.at > FRESH_MS) {
    pending ??= load().finally(() => (pending = null))
    // With a copy in hand, answer now and let the refresh land for the next visitor
    if (cache) pending.catch(() => undefined)
    else await pending.catch(() => undefined)
  }
  const body = cache ?? { channel: null, vods: [], at: Date.now() }
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Shared CDN cache on Vercel: Kick is asked about once a minute at most
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
    body: JSON.stringify(body),
  }
}
