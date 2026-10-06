/*
 * Admin-managed content (challenges, the item store) and its defaults.
 * Plain data shared by the server (which stores and serves it) and the pages
 * (which fall back to the defaults until the server answers).
 *
 * Image paths are stable public URLs: /content/… for the built-in art,
 * /api/uploads/… for admin uploads, or a Stake catalog image (imgix).
 */

export type ChallengeStatus = 'active' | 'completed'

export type Challenge = {
  id: string
  game: string
  /** Stake game slug (from the catalog), for the "play" link */
  slug?: string
  image: string
  /** Target multiplier to hit, e.g. 2500 for 2,500× */
  multiplier: number
  /** Minimum bet in USD */
  minBet: number
  /** Prize in USD */
  reward: number
  status: ChallengeStatus
  /** Who hit it (shown on the card once completed) */
  completedBy?: string
  createdAt: number
}

/** Card colour: gold, purple or blue (background glow, ring, bag and button) */
export type ItemTier = 'gold' | 'purple' | 'blue'

export type StoreItem = {
  id: string
  name: string
  /** Price in King Points */
  price: number
  tier: ItemTier
  /** Product photo; items without one show the tier's shopping-bag symbol */
  image?: string
  /** Hand-placed photo position (built-in items); others are centred in the card's top area */
  imageBox?: { width: number; height: number; left: number; top: number }
  /** Left in stock (null: unlimited) */
  stock: number | null
  /** Hidden items stay in the admin list but not in the store */
  hidden?: boolean
  createdAt: number
}

const T0 = Date.UTC(2026, 9, 1)

export const DEFAULT_CHALLENGES: Challenge[] = [
  { id: 'waylanders-forge-2500', game: 'Waylanders Forge', slug: 'valkyrie-waylanders-forge', image: '/content/challenges/waylanders-forge.webp', multiplier: 2500, minBet: 0.2, reward: 100 },
  { id: 'sweet-bonanza-750', game: 'Sweet Bonanza', image: '/content/challenges/sweet-bonanza.webp', multiplier: 750, minBet: 0.6, reward: 200 },
  { id: 'gates-of-olympus-1000-10000', game: 'Gates Of Olympus 1000', slug: 'pragmatic-play-gates-of-olympus-1000', image: '/content/challenges/gates-of-olympus-1000.webp', multiplier: 10000, minBet: 1, reward: 1200 },
  { id: 'ganja-snail-1500', game: 'Ganja Snail', image: '/content/challenges/ganja-snail.webp', multiplier: 1500, minBet: 0.1, reward: 50 },
  { id: 'waylanders-forge-20000', game: 'Waylanders Forge', slug: 'valkyrie-waylanders-forge', image: '/content/challenges/waylanders-forge.webp', multiplier: 20000, minBet: 0.05, reward: 250 },
  { id: 'odins-vault-50000', game: 'Odin’s Vault', image: '/content/challenges/odins-vault.webp', multiplier: 50000, minBet: 0.02, reward: 300 },
  { id: 'wanted-dead-or-a-wild-12500', game: 'Wanted Dead or Wild', image: '/content/challenges/wanted-dead-or-a-wild.webp', multiplier: 12500, minBet: 0.4, reward: 750 },
  { id: 'original-keno-500', game: 'Original Keno', image: '/content/challenges/keno.webp', multiplier: 500, minBet: 2, reward: 150 },
  { id: 'legion-5000', game: 'Legion', image: '/content/challenges/legion.webp', multiplier: 5000, minBet: 0.1, reward: 75 },
].map((c, i) => ({ ...c, status: 'active' as const, createdAt: T0 + i }))

export const DEFAULT_STORE_ITEMS: StoreItem[] = [
  { id: 'air-force-1', name: 'Air Force 1 Low Off-White', price: 250000, tier: 'gold' as const, image: '/content/shop/air-force.webp', imageBox: { width: 134, height: 134, left: 35, top: -9 } },
  { id: 'iphone-16-pro-max', name: 'Iphone 16 Pro Max', price: 500000, tier: 'gold' as const, image: '/content/shop/iphone-16-pro-max.webp', imageBox: { width: 109, height: 109, left: 47, top: -6 } },
  { id: 'airpods-4', name: 'AirPods 4', price: 100000, tier: 'gold' as const, image: '/content/shop/airpods-4.webp', imageBox: { width: 117, height: 117, left: 43, top: -14 } },
  { id: 'playstation-5', name: 'PlayStation 5', price: 250000, tier: 'gold' as const, image: '/content/shop/playstation-5.webp', imageBox: { width: 111, height: 95, left: 45, top: 6 } },
  { id: 'item-5', name: 'PlayStation 5', price: 250000, tier: 'gold' as const },
  { id: 'item-6', name: 'PlayStation 5', price: 250000, tier: 'gold' as const },
  { id: 'item-7', name: 'PlayStation 5', price: 75000, tier: 'purple' as const },
  { id: 'item-8', name: 'PlayStation 5', price: 250000, tier: 'purple' as const },
  { id: 'item-9', name: 'PlayStation 5', price: 250000, tier: 'purple' as const },
  { id: 'item-10', name: 'PlayStation 5', price: 250000, tier: 'purple' as const },
  { id: 'item-11', name: 'PlayStation 5', price: 250000, tier: 'purple' as const },
  { id: 'item-12', name: 'PlayStation 5', price: 250000, tier: 'purple' as const },
  { id: 'item-13', name: 'PlayStation 5', price: 25000, tier: 'blue' as const },
  { id: 'item-14', name: 'PlayStation 5', price: 25000, tier: 'blue' as const },
  { id: 'item-15', name: 'PlayStation 5', price: 25000, tier: 'blue' as const },
].map((item, i) => ({ ...item, stock: null, createdAt: T0 + i }))

/** Default placement for a product photo without a hand-placed box */
export const DEFAULT_IMAGE_BOX = { width: 120, height: 104, left: 40, top: 4 }

/** Stake game page for a catalog slug */
export const stakeGameUrl = (slug: string) => `https://stake.com/casino/games/${slug}`
