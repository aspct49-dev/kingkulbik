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
 *   the win cap leaves the pool for the draws after.
 *
 *   An admin can reroll a draw (the winner couldn't take it): it stays on the
 *   list marked rerolled, that player leaves the pool, and the replacement is
 *   simply the next draw k from the same seed, so rerolls are re-run too. The
 *   seed is revealed only when an admin finishes the raffle: until then
 *   nobody can know who a reroll would pick.
 *
 *   Bots (EXCLUDED_NAMES) never get tickets.
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

/** A saved copy of a raffle's ticket list (server/raffles.ts takes one hourly while open, at lock and before a reset) */
export type RaffleSnapshot = {
  at: number
  reason: 'hourly' | 'lock' | 'reset'
  /** [name, amount]: tickets are worked out with the raffle's unit, as at lock */
  rows: [string, number][]
}

/** The admin's list of a raffle's snapshots */
export type RaffleSnapshotSummary = { at: number; reason: RaffleSnapshot['reason']; players: number; tickets: number }

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
  /** Rerolled by an admin: doesn't count, and that player can't be drawn again in this raffle */
  rerolledAt?: number
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

/** Accounts that never get tickets: chat bots (Kick's, BotRix's, BonusTracker's), which sit in chat all stream */
export const EXCLUDED_NAMES = ['kickbot', 'botrix', 'bonustracker']
const excluded = new Set(EXCLUDED_NAMES)
export const isExcluded = (name: string) => excluded.has(name.trim().toLowerCase())

/** Freeze entries in a fixed, reproducible order (by name, then amount) */
export function freezeEntries(rows: { name: string; amount: number }[], unit: number): RaffleEntry[] {
  return rows
    .map((r) => ({ name: r.name, amount: Math.round(r.amount * 100) / 100, tickets: ticketsFor(r.amount, unit) }))
    .filter((e) => e.tickets > 0 && !isExcluded(e.name))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || b.amount - a.amount)
}

/** The draws that count: not rerolled */
export const keptDraws = <T extends Pick<RaffleDraw, 'rerolledAt'>>(draws: T[]) => draws.filter((d) => !d.rerolledAt)

/** Who can still be drawn: under the win cap, and not rerolled away */
export function stillInDraw<E extends Pick<RaffleEntry, 'name'>>(
  entries: E[],
  draws: Pick<RaffleDraw, 'name' | 'rerolledAt'>[],
  maxWinsPerPerson: number,
): E[] {
  const wins = new Map<string, number>()
  const out = new Set<string>()
  for (const d of draws) {
    if (d.rerolledAt) out.add(d.name)
    else wins.set(d.name, (wins.get(d.name) ?? 0) + 1)
  }
  return entries.filter((e) => !out.has(e.name) && (wins.get(e.name) ?? 0) < maxWinsPerPerson)
}

/**
 * Draw k (k = every draw before it, rerolled ones included). Returns null
 * when nobody can win any more (everyone left has hit the cap).
 */
export async function drawNext(
  raffle: Pick<Raffle, 'id' | 'entries' | 'maxWinsPerPerson'>,
  seed: string,
  previous: Pick<RaffleDraw, 'name' | 'rerolledAt'>[],
): Promise<{ name: string; ticket: number; pool: number } | null> {
  const eligible = stillInDraw(raffle.entries, previous, raffle.maxWinsPerPerson)
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

/**
 * Re-run every draw from a revealed seed (for the Verify button). `recorded`:
 * the raffle's draws, for which ones were rerolled (an admin's call, so it
 * comes from the record; who each draw picked is what the re-run checks).
 */
export async function replayDraws(
  raffle: Pick<Raffle, 'id' | 'entries' | 'maxWinsPerPerson' | 'prizePool' | 'prizePerDraw'>,
  seed: string,
  recorded?: Pick<RaffleDraw, 'rerolledAt'>[],
) {
  const out: { name: string; ticket: number; pool: number; rerolledAt?: number }[] = []
  while (recorded ? out.length < recorded.length : keptDraws(out).length < drawCount(raffle)) {
    const next = await drawNext(raffle, seed, out)
    if (!next) break
    const rerolledAt = recorded?.[out.length]?.rerolledAt
    out.push(rerolledAt ? { ...next, rerolledAt } : next)
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
  /** The last chat message from either source */
  lastEventAt: number | null
  /** The last one from Kick's webhooks (since the server started) */
  lastWebhookAt: number | null
  /** Kick's live chat connection, held open by the server */
  socket: 'off' | 'connecting' | 'on'
  /** The last message from the live connection (since the server started) */
  lastSocketAt: number | null
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
