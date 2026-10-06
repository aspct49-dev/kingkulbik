/*
 * Player profiles: what the server remembers about each signed-in player
 * (Discord, linked accounts, originals totals), their originals bet history
 * and their Item Store redemptions. Shared by the server, the account page
 * and the admin panel.
 */

import type { GameId } from './originals.js'
import type { ItemTier } from './content.js'

export type PlayerProfile = {
  /** Discord user id */
  id: string
  name: string
  username: string
  avatar: string | null
  kick: { id: string; username: string } | null
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

export type RedemptionStatus = 'pending' | 'fulfilled' | 'rejected'

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
}

/** Everything the account page (and the admin's view of a player) shows */
export type ProfileView = {
  profile: PlayerProfile
  bets: PlayerBet[]
  redemptions: Redemption[]
  /** Wager under the code from the linked Stake account (null: not linked or Stake unreachable) */
  wagered: number | null
}
