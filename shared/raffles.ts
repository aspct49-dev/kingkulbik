/*
 * Monthly raffles: one on wager under the code (Stake), one on watch time
 * (BotRix). Shared by the server (which freezes entries and draws) and the
 * pages (which show the odds and let anyone re-check a finished draw).
 *
 * Fair draws
 *   Locking a raffle freezes every entry's tickets and commits to a secret
 *   seed by publishing its SHA-256 hash. Draw k takes one float from
 *   HMAC-SHA256(seed, `${raffleId}:${k}:0`) (the originals' scheme), picks
 *   ticket floor(float × tickets in play), and the entry holding that ticket
 *   wins. So odds are exactly tickets ÷ tickets in play. Someone who reaches
 *   the win cap leaves the pool for the draws after. Finishing reveals the
 *   seed, and the same function below re-runs every draw.
 */

import { fairFloats } from './originals.js'

export type RaffleKind = 'wager' | 'watch'

/** open: tickets still counting · locked: frozen, seed committed · complete: every draw made */
export type RaffleStatus = 'open' | 'locked' | 'complete'

export type RaffleEntry = {
  /** Stake username (wager) or Kick name (watch) */
  name: string
  /** Dollars wagered, or minutes watched, in the period */
  amount: number
  tickets: number
}

export type RaffleDraw = {
  /** 0-based draw number */
  n: number
  /** The winning ticket (0-based, in the frozen order) */
  ticket: number
  /** Tickets in play for this draw */
  pool: number
  name: string
  prize: number
  at: number
}

export type Raffle = {
  id: string
  kind: RaffleKind
  title: string
  /** Counting window (ms, end exclusive) */
  start: number
  end: number
  prizePool: number
  prizePerDraw: number
  maxWinsPerPerson: number
  /** Dollars per ticket (wager) or minutes per ticket (watch) */
  ticketUnit: number
  status: RaffleStatus
  /** Frozen at lock, sorted by name */
  entries: RaffleEntry[]
  seedHash: string | null
  /** Revealed when complete */
  seed: string | null
  draws: RaffleDraw[]
  createdAt: number
  lockedAt: number | null
  completedAt: number | null
}

export const DEFAULT_RAFFLE: Record<RaffleKind, Pick<Raffle, 'title' | 'prizePool' | 'prizePerDraw' | 'maxWinsPerPerson' | 'ticketUnit'>> = {
  wager: { title: 'Monthly Wager Raffle', prizePool: 1000, prizePerDraw: 200, maxWinsPerPerson: 2, ticketUnit: 1000 },
  watch: { title: 'Monthly Watch-Time Raffle', prizePool: 500, prizePerDraw: 100, maxWinsPerPerson: 2, ticketUnit: 60 },
}

export const drawCount = (r: Pick<Raffle, 'prizePool' | 'prizePerDraw'>) =>
  r.prizePerDraw > 0 ? Math.floor(r.prizePool / r.prizePerDraw + 1e-9) : 0

export const ticketsFor = (amount: number, unit: number) => (unit > 0 ? Math.floor(amount / unit + 1e-9) : 0)

/** Freeze entries in a fixed, reproducible order (by name, then amount) */
export function freezeEntries(rows: { name: string; amount: number }[], unit: number): RaffleEntry[] {
  return rows
    .map((r) => ({ name: r.name, amount: Math.round(r.amount * 100) / 100, tickets: ticketsFor(r.amount, unit) }))
    .filter((e) => e.tickets > 0)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || b.amount - a.amount)
}

/**
 * Draw k given the draws before it. Returns null when nobody can win any more
 * (everyone left has hit the cap).
 */
export async function drawNext(
  raffle: Pick<Raffle, 'id' | 'entries' | 'maxWinsPerPerson'>,
  seed: string,
  previous: Pick<RaffleDraw, 'name'>[],
): Promise<{ name: string; ticket: number; pool: number } | null> {
  const wins = new Map<string, number>()
  for (const d of previous) wins.set(d.name, (wins.get(d.name) ?? 0) + 1)
  const eligible = raffle.entries.filter((e) => (wins.get(e.name) ?? 0) < raffle.maxWinsPerPerson)
  const pool = eligible.reduce((s, e) => s + e.tickets, 0)
  if (pool <= 0) return null
  const [f] = await fairFloats(seed, raffle.id, previous.length, 1)
  const ticket = Math.min(pool - 1, Math.floor(f * pool))
  let at = 0
  for (const e of eligible) {
    at += e.tickets
    if (ticket < at) return { name: e.name, ticket, pool }
  }
  return null
}

/** Re-run every draw from a revealed seed (for the Verify button) */
export async function replayDraws(raffle: Pick<Raffle, 'id' | 'entries' | 'maxWinsPerPerson' | 'prizePool' | 'prizePerDraw'>, seed: string) {
  const out: { name: string; ticket: number; pool: number }[] = []
  for (let k = 0; k < drawCount(raffle); k++) {
    const next = await drawNext(raffle, seed, out)
    if (!next) break
    out.push(next)
  }
  return out
}

/** "Aydent9" → "Ayd***t9", as on the leaderboard (full Stake names stay off public pages) */
export function maskName(name: string) {
  const n = name.trim()
  if (n.length <= 5) return n.slice(0, 1) + '***'
  return n.slice(0, 3) + '***' + n.slice(-2)
}

/** Calendar month containing `now` (UTC) */
export function monthWindow(now = Date.now()) {
  const d = new Date(now)
  return { start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }
}

/** What the public page gets */
/** Kick chat webhooks (server/kickChat.ts), for the admin panel */
export type KickChatStatus = {
  /** Subscribed to the channel's chat */
  connected: boolean
  connectedAt: number | null
  /** The last chat message Kick delivered */
  lastEventAt: number | null
  /** Different people who chatted in the last 24 hours */
  chattersToday: number
  /** The last thing that went wrong (connecting, or the hourly check) */
  error: string | null
}

export type PublicRaffle = Omit<Raffle, 'entries' | 'draws'> & {
  entries: (RaffleEntry & { odds: number })[]
  draws: RaffleDraw[]
  totalTickets: number
  drawsTotal: number
  /** The signed-in viewer's own entry (unmasked), when they have one */
  mine: (RaffleEntry & { odds: number; wins: number }) | null
  /** Watch raffle: when the month's baseline was taken (watch time counts from then) */
  countingFrom: number | null
  updatedAt: number
}
