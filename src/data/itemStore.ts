import airForce from '../assets/item-store/air-force.webp'
import iphone from '../assets/item-store/iphone-16-pro-max.webp'
import airpods from '../assets/item-store/airpods-4.webp'
import playstation from '../assets/item-store/playstation-5.webp'

/** Card colour: gold, purple or blue (background glow, ring, bag and button) */
export type ItemTier = 'gold' | 'purple' | 'blue'

export type StoreItem = {
  id: string
  name: string
  /** Price in King Points */
  price: number
  tier: ItemTier
  /** Product photo; items without one show the tier's shopping-bag symbol */
  image?: {
    src: string
    /** Size and offset from the card's top-left, as placed in the design */
    width: number
    height: number
    left: number
    top: number
  }
}

/*
 * The store from the design, including its placeholder rows. Static for now;
 * the real catalogue comes from the admin panel once accounts and points land.
 */
export const STORE_ITEMS: StoreItem[] = [
  { id: 'air-force-1', name: 'Air Force 1 Low Off-White', price: 250000, tier: 'gold', image: { src: airForce, width: 134, height: 134, left: 35, top: -9 } },
  { id: 'iphone-16-pro-max', name: 'Iphone 16 Pro Max', price: 500000, tier: 'gold', image: { src: iphone, width: 109, height: 109, left: 47, top: -6 } },
  { id: 'airpods-4', name: 'AirPods 4', price: 100000, tier: 'gold', image: { src: airpods, width: 117, height: 117, left: 43, top: -14 } },
  { id: 'playstation-5', name: 'PlayStation 5', price: 250000, tier: 'gold', image: { src: playstation, width: 111, height: 95, left: 45, top: 6 } },
  { id: 'item-5', name: 'PlayStation 5', price: 250000, tier: 'gold' },
  { id: 'item-6', name: 'PlayStation 5', price: 250000, tier: 'gold' },
  { id: 'item-7', name: 'PlayStation 5', price: 75000, tier: 'purple' },
  { id: 'item-8', name: 'PlayStation 5', price: 250000, tier: 'purple' },
  { id: 'item-9', name: 'PlayStation 5', price: 250000, tier: 'purple' },
  { id: 'item-10', name: 'PlayStation 5', price: 250000, tier: 'purple' },
  { id: 'item-11', name: 'PlayStation 5', price: 250000, tier: 'purple' },
  { id: 'item-12', name: 'PlayStation 5', price: 250000, tier: 'purple' },
  { id: 'item-13', name: 'PlayStation 5', price: 25000, tier: 'blue' },
  { id: 'item-14', name: 'PlayStation 5', price: 25000, tier: 'blue' },
  { id: 'item-15', name: 'PlayStation 5', price: 25000, tier: 'blue' },
]

/** The summary tiles above the store (static until purchases are tracked) */
export const STORE_STATS = {
  mostRedeemed: 'Iphone 16 Pro Max',
  biggestPurchase: 'Air Force',
  totalSpent: 100820,
  itemsSold: 323,
}
