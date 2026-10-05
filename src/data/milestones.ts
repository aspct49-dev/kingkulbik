import iconBronze from '../assets/rewards/icon-bronze.svg'
import iconSilver from '../assets/rewards/icon-silver.svg'
import iconGold from '../assets/rewards/icon-gold.svg'
import iconPlatinum1 from '../assets/rewards/icon-platinum-1.svg'
import iconPlatinum2 from '../assets/rewards/icon-platinum-2.svg'
import iconPlatinum3 from '../assets/rewards/icon-platinum-3.svg'
import iconPlatinum5 from '../assets/rewards/icon-platinum-5.svg'
import iconPlatinum6 from '../assets/rewards/icon-platinum-6.svg'
import badgeBronze from '../assets/rewards/badge-bronze.svg'
import badgeSilver from '../assets/rewards/badge-silver.svg'
import badgeGold from '../assets/rewards/badge-gold.svg'
import badgePlatinum1 from '../assets/rewards/badge-platinum-1.svg'
import badgePlatinum2 from '../assets/rewards/badge-platinum-2.svg'
import badgePlatinum3 from '../assets/rewards/badge-platinum-3.svg'
import badgePlatinum5 from '../assets/rewards/badge-platinum-5.svg'
import badgePlatinum6 from '../assets/rewards/badge-platinum-6.svg'

/** Colour family of a rank: its name, progress fill and badge */
export type RankTone = 'bronze' | 'silver' | 'gold' | 'platinum'

export type Milestone = {
  id: string
  /** Text before the rank name, e.g. "Reach" (empty to show the rank alone) */
  prefix: string
  rank: string
  tone: RankTone
  /** Wager under the code needed to unlock it, USD */
  wager: number
  /** Prize, USD */
  prize: number
  icon: string
  /** Large badge on the timeline; all but the last include the line down to the next one */
  badge: string
}

/*
 * The milestones from the design. Two rows look like placeholders in the
 * design itself (a second Silver tier without "Reach", and Platinum V and VI
 * both at $5,000,000) and are kept as drawn until the real tiers are set.
 */
export const MILESTONES: Milestone[] = [
  { id: 'bronze', prefix: 'Reach', rank: 'Bronze', tone: 'bronze', wager: 10_000, prize: 25, icon: iconBronze, badge: badgeBronze },
  { id: 'silver', prefix: 'Reach', rank: 'Silver', tone: 'silver', wager: 25_000, prize: 50, icon: iconSilver, badge: badgeSilver },
  { id: 'silver-2', prefix: '', rank: 'Silver', tone: 'silver', wager: 50_000, prize: 75, icon: iconSilver, badge: badgeSilver },
  { id: 'gold', prefix: 'Reach', rank: 'Gold', tone: 'gold', wager: 100_000, prize: 125, icon: iconGold, badge: badgeGold },
  { id: 'platinum-1', prefix: 'Reach', rank: 'Platinum I', tone: 'platinum', wager: 250_000, prize: 250, icon: iconPlatinum1, badge: badgePlatinum1 },
  { id: 'platinum-2', prefix: 'Reach', rank: 'Platinum II', tone: 'platinum', wager: 500_000, prize: 500, icon: iconPlatinum2, badge: badgePlatinum2 },
  { id: 'platinum-3', prefix: 'Reach', rank: 'Platinum III', tone: 'platinum', wager: 1_000_000, prize: 1000, icon: iconPlatinum3, badge: badgePlatinum3 },
  { id: 'platinum-5', prefix: 'Reach', rank: 'Platinum V', tone: 'platinum', wager: 5_000_000, prize: 3000, icon: iconPlatinum5, badge: badgePlatinum5 },
  { id: 'platinum-6', prefix: 'Reach', rank: 'Platinum VI', tone: 'platinum', wager: 5_000_000, prize: 6000, icon: iconPlatinum6, badge: badgePlatinum6 },
]
