import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import coinIcon from '../assets/coin.svg'
import storeIcon from '../assets/item-store/store-icon.svg'
import searchIcon from '../assets/item-store/search.svg'
import bgGold from '../assets/item-store/bg-gold.webp'
import bgPurple from '../assets/item-store/bg-purple.webp'
import bgBlue from '../assets/item-store/bg-blue.webp'
import ringOuterGold from '../assets/item-store/ring-outer-gold.svg'
import ringInnerGold from '../assets/item-store/ring-inner-gold.svg'
import ringOuterPurple from '../assets/item-store/ring-outer-purple.svg'
import ringInnerPurple from '../assets/item-store/ring-inner-purple.svg'
import ringOuterBlue from '../assets/item-store/ring-outer-blue.svg'
import ringInnerBlue from '../assets/item-store/ring-inner-blue.svg'
import bagGold from '../assets/item-store/bag-gold.svg'
import bagPurple from '../assets/item-store/bag-purple.svg'
import bagBlue from '../assets/item-store/bag-blue.svg'
import ringOuterStat from '../assets/item-store/ring-outer-stat.svg'
import ringInnerStat from '../assets/item-store/ring-inner-stat.svg'
import ringOuterStatCoin from '../assets/item-store/ring-outer-stat-coin.svg'
import ringInnerStatCoin from '../assets/item-store/ring-inner-stat-coin.svg'
import bagStat from '../assets/item-store/bag-stat.svg'
import bagSolidGold from '../assets/item-store/bag-solid-gold.svg'
import iphone from '../assets/item-store/iphone-16-pro-max.webp'
import airForce from '../assets/item-store/air-force.webp'
import PageHeading from '../components/PageHeading'
import SortSelect from '../components/SortSelect'
import Toast, { useToast } from '../components/Toast'
import { STORE_ITEMS, STORE_STATS } from '../data/itemStore'
import type { ItemTier, StoreItem } from '../data/itemStore'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './ChallengesPage.css'
import './ItemStorePage.css'

type Sort = 'featured' | 'price-asc' | 'price-desc'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Ascending' },
  { value: 'price-desc', label: 'Price: Descending' },
]

const TIER_ART: Record<ItemTier, { bg: string; outer: string; inner: string; bag: string }> = {
  gold: { bg: bgGold, outer: ringOuterGold, inner: ringInnerGold, bag: bagGold },
  purple: { bg: bgPurple, outer: ringOuterPurple, inner: ringInnerPurple, bag: bagPurple },
  blue: { bg: bgBlue, outer: ringOuterBlue, inner: ringInnerBlue, bag: bagBlue },
}

const points = (value: number) => value.toLocaleString('en-US')

/** The ringed symbol on the right of a stat tile, optionally with a picture on top */
function StatSymbol({ variant, image }: { variant: 'bag' | 'coin'; image?: { src: string; size: number; at: number } }) {
  const coin = variant === 'coin'
  return (
    <span className="store-stat__symbol" aria-hidden>
      <img className="store-stat__ring-outer" src={coin ? ringOuterStatCoin : ringOuterStat} width={59} height={59} alt="" />
      <img
        className="store-stat__ring-inner"
        src={coin ? ringInnerStatCoin : ringInnerStat}
        width={52.9796}
        height={52.9796}
        alt=""
      />
      {coin ? (
        <img className="store-stat__coin" src={coinIcon} width={47} height={47} alt="" />
      ) : (
        <img className="store-stat__bag" src={bagStat} width={27.8453} height={30.5234} alt="" />
      )}
      {image && (
        <img
          className="store-stat__image"
          src={image.src}
          width={image.size}
          height={image.size}
          style={{ left: image.at, top: image.at }}
          alt=""
        />
      )}
    </span>
  )
}

function StoreCard({ item, onPurchase }: { item: StoreItem; onPurchase: () => void }) {
  const { phase, handlers } = useHoverAnimation()
  const art = TIER_ART[item.tier]
  const image = item.image

  return (
    <li className={`store-card hover-anim hover-anim--${phase}`} {...handlers}>
      <div className="store-card__stage" aria-hidden>
        <div className="store-card__glow">
          <img src={art.bg} width={201} height={118} alt="" />
        </div>
        <img className="store-card__ring-outer" src={art.outer} width={98} height={98} alt="" />
        <img className="store-card__ring-inner" src={art.inner} width={88} height={88} alt="" />
        <img className="store-card__bag" src={art.bag} width={46.2515} height={50.6999} alt="" />
        {image && (
          <img
            className="store-card__product"
            src={image.src}
            width={image.width}
            height={image.height}
            style={{ left: `calc(50% + ${image.left - 100.5}px)`, top: image.top } as CSSProperties}
            alt=""
            loading="lazy"
          />
        )}
      </div>
      <h2 className="store-card__name" title={item.name}>
        {item.name}
      </h2>
      <p className="store-card__price">
        <img src={coinIcon} width={10} height={10} alt="" />
        {points(item.price)}
        <span className="visually-hidden"> King Points</span>
      </p>
      <button type="button" className={`kk-button kk-button--${item.tier} store-card__buy`} onClick={onPurchase}>
        PURCHASE
      </button>
    </li>
  )
}

/** Spend King Points on real items and balance top-ups */
export default function ItemStorePage() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('featured')
  const { toast, show } = useToast(2400)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? STORE_ITEMS.filter((item) => item.name.toLowerCase().includes(q)) : STORE_ITEMS
    if (sort === 'featured') return found
    return [...found].sort((a, b) => (sort === 'price-asc' ? a.price - b.price : b.price - a.price))
  }, [query, sort])

  // Purchases need an account and points; until sign-in exists, say so instead of doing nothing
  const purchase = () => show('Sign in to buy with King Points. Accounts are coming soon.')

  return (
    <div className="section-page">
      <div className="store">
        <PageHeading icon={storeIcon} gold="ITEM" rest="STORE">
          Spend your <span className="page-heading__accent">KING POINTS</span> on various Items from IRL to balance top
          ups!
        </PageHeading>

        <ul className="store-stats">
          <li className="store-stat">
            <span className="store-stat__text">
              <span className="store-stat__label">Most Redeemed Item</span>
              <span className="store-stat__value">{STORE_STATS.mostRedeemed}</span>
            </span>
            <StatSymbol variant="bag" image={{ src: iphone, size: 54, at: 3 }} />
          </li>
          <li className="store-stat">
            <span className="store-stat__text">
              <span className="store-stat__label">Biggest Purchase</span>
              <span className="store-stat__value">{STORE_STATS.biggestPurchase}</span>
            </span>
            <StatSymbol variant="bag" image={{ src: airForce, size: 71, at: -6 }} />
          </li>
          <li className="store-stat">
            <span className="store-stat__text">
              <span className="store-stat__label">Total Spent</span>
              <span className="store-stat__value">
                <img src={coinIcon} width={16} height={16} alt="" />
                {points(STORE_STATS.totalSpent)}
                <span className="visually-hidden"> King Points</span>
              </span>
            </span>
            <StatSymbol variant="coin" />
          </li>
          <li className="store-stat">
            <span className="store-stat__text">
              <span className="store-stat__label">Total Items Sold</span>
              <span className="store-stat__value">{points(STORE_STATS.itemsSold)} Items</span>
            </span>
            <span className="store-stat__symbol" aria-hidden>
              <img className="store-stat__solid-bag" src={bagSolidGold} width={42.3972} height={44.7352} alt="" />
            </span>
          </li>
        </ul>

        <div className="store__filter">
          <label className="store__search">
            <img src={searchIcon} width={14} height={14} alt="" />
            <span className="visually-hidden">Search for items</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for items"
              autoComplete="off"
            />
          </label>
          <SortSelect className="store__sort" value={sort} options={SORTS} onChange={setSort} />
        </div>

        {items.length > 0 ? (
          <ul className="store__grid">
            {items.map((item) => (
              <StoreCard key={item.id} item={item} onPurchase={purchase} />
            ))}
          </ul>
        ) : (
          <p className="store__empty">No items match “{query.trim()}”.</p>
        )}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
