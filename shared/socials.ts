/*
 * The Socials & Video page: the Kick channel and its recent streams (VODs),
 * read from Kick's public channel API on the server and passed on as is.
 */

export type KickChannelInfo = {
  followers: number
  /** Live now, with what's on */
  live: { title: string; viewers: number; category: string | null; startedAt: string } | null
  /** Shown while offline (Kick's offline banner) */
  offlineBanner: string | null
  avatar: string | null
}

export type KickVod = {
  /** Kick's video id: kick.com/<channel>/videos/<id> */
  id: string
  title: string
  thumbnail: string | null
  /** 0 while the stream is still running */
  durationMs: number
  views: number
  startedAt: string
  category: string | null
  /** The stream running now (its VOD is still recording) */
  live: boolean
}

export type KickSocials = {
  channel: KickChannelInfo | null
  vods: KickVod[]
  /** When this was read from Kick (ms) */
  at: number
}
