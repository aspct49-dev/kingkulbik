/*
 * Player profiles: what the server remembers about each signed-in player
 * (Discord and Kick, linked accounts, originals totals), their originals bet history
 * and their Item Store redemptions. Shared by the server, the account page
 * and the admin panel.
 */

import type { GameId } from './originals.js'
import type { ItemTier } from './content.js'

export type PlayerProfile = {
  /** Account id: the Discord id (accounts made with Discord), or kick-<Kick user id> (made with Kick) */
  id: string
  /** The linked Discord (null: none). Older profiles leave it out: their id is the Discord id */
  discordId?: string | null
  /** Discord name, username and avatar; Kick's when no Discord is linked */
  name: string
  username: string
  avatar: string | null
  kick: { id: string; username: string; avatar?: string | null } | null
  stake: { username: string } | null
  firstSeen: number
  lastSeen: number
  /** Originals totals (all time, unlike the capped history) */
  bets: number
  wagered: number
  paid: number
}

export type PlayerBet = {
  id: string
  userId: string
  game: GameId
  bet: number
  multiplier: number
  payout: number
  at: number
  /** Enough to verify it in the Fairness dialog once the seed is revealed */
  serverSeedHash: string
  clientSeed: string
  /** Keno: the bet's nonce. Coinflip: the nonce of each flip in the game */
  nonces: number[]
  /** Keno: picks and draw. Coinflip: calls and results */
  detail: { picks?: number[]; drawn?: number[]; risk?: string; calls?: string[]; results?: string[] }
}

/** pending: points taken, waiting on an admin · fulfilled: delivered · rejected / cancelled: points refunded */
export type RedemptionStatus = 'pending' | 'fulfilled' | 'rejected' | 'cancelled'

export type Redemption = {
  id: string
  userId: string
  /** Snapshot at request time, so the record reads right if the profile changes */
  player: string
  kick: string
  itemId: string
  itemName: string
  itemImage?: string
  tier: ItemTier
  price: number
  status: RedemptionStatus
  /** Admin's note to the player (e.g. why it was rejected) */
  note?: string
  at: number
  decidedAt: number | null
  /** The points were taken in BotRix when it was requested (older requests were charged by hand) */
  charged?: boolean
  /** Points given back in BotRix (rejected or cancelled) */
  refunded?: boolean
  /** Admin who approved or rejected it */
  handledBy?: string
}

/** One change to a viewer's BotRix points made from the site */
export type PointsLogEntry = {
  id: string
  at: number
  /** Kick name the points belong to */
  kick: string
  /** Positive: added. Negative: taken */
  delta: number
  kind: 'admin' | 'redeem' | 'refund' | 'originals'
  reason: string
  /** Admin's name, or the player's for their own purchases */
  by: string
  ok: boolean
  error?: string
}

export type ShopSettings = {
  /** Days between a player's purchases (0: no limit). Rejected or cancelled ones don't count */
  cooldownDays: number
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = { cooldownDays: 7 }

/** Everything the account page (and the admin's view of a player) shows */
export type ProfileView = {
  profile: PlayerProfile
  bets: PlayerBet[]
  redemptions: Redemption[]
  /** Wager under the code from the linked Stake account (null: not linked or Stake unreachable) */
  wagered: number | null
}
