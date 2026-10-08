import { useEffect, useMemo, useRef, useState } from 'react'
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
import PageHeading from '../components/PageHeading'
import SortSelect from '../components/SortSelect'
import { DEFAULT_IMAGE_BOX } from '../../shared/content'
import type { ItemTier, StoreItem } from '../../shared/content'
import { DEFAULT_STAT_IMAGE_BOX, STAT_IMAGE_BOX } from '../data/itemStore'
import Toast, { useToast } from '../components/Toast'
import { useProfile } from '../hooks/useProfile'
import { linkKickUrl, refreshPoints, setPointsBalance, signInUrl, useAuth, usePoints } from '../hooks/useAuth'
import { useStoreItems } from '../hooks/useContent'
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
function StatSymbol({
  variant,
  image,
}: {
  variant: 'bag' | 'coin'
  image?: { src: string; size: number; at: number }
}) {
  const coin = variant === 'coin'
  return (
    <span className="store-stat__symbol" aria-hidden>
      <img
        className="store-stat__ring-outer"
        src={coin ? ringOuterStatCoin : ringOuterStat}
        width={59}
        height={59}
        alt=""
      />
      <span className="store-stat__ring-fill" />
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

/** The iPhone on the gold card's rings, scaled up (the Coming Soon page's art) */
export function StoreHeroArt() {
  const art = TIER_ART.gold
  return (
    <div className="store-hero-art">
      <div className="store-card__stage">
        <div className="store-card__glow">
          <img src={art.bg} width={201} height={118} alt="" />
        </div>
        <img className="store-card__ring-outer" src={art.outer} width={98} height={98} alt="" />
        <span className="store-card__ring-fill" />
        <img className="store-card__ring-inner" src={art.inner} width={88} height={88} alt="" />
        <img className="store-hero-art__phone" src="/content/shop/iphone-16-pro-max.webp" width={109} height={109} alt="" />
      </div>
    </div>
  )
}

/** What Purchase does for this viewer: ask to redeem, or say why it can't */
export type BuyState = { kind: 'buy' } | { kind: 'short'; missing: number } | { kind: 'sold-out' }

/** One store item (also the live preview in the admin panel) */
export function StoreCard({ item, buy, onBuy }: { item: StoreItem; buy: BuyState; onBuy?: (item: StoreItem) => void }) {
  const { phase, handlers } = useHoverAnimation()
  const art = TIER_ART[item.tier]
  const box = item.imageBox ?? DEFAULT_IMAGE_BOX

  return (
    <li className={`store-card hover-anim hover-anim--${phase}`} {...handlers}>
      <div className="store-card__stage" aria-hidden>
        <div className="store-card__glow">
          <img src={art.bg} width={201} height={118} alt="" />
        </div>
        <img className="store-card__ring-outer" src={art.outer} width={98} height={98} alt="" />
        <span className="store-card__ring-fill" />
        <img className="store-card__ring-inner" src={art.inner} width={88} height={88} alt="" />
        <img className="store-card__bag" src={art.bag} width={46.2515} height={50.6999} alt="" />
        {item.image && (
          <img
            className="store-card__product"
            src={item.image}
            width={box.width}
            height={box.height}
            style={{ left: `calc(50% + ${box.left - 100.5}px)`, top: box.top } as CSSProperties}
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
      {buy.kind === 'buy' ? (
        <button
          type="button"
          className={`kk-button kk-button--${item.tier} store-card__buy`}
          onClick={() => onBuy?.(item)}
        >
          PURCHASE
        </button>
      ) : (
        <span className="store-card__buy store-card__buy--short">
          {buy.kind === 'sold-out' ? 'Sold out' : `Need ${points(buy.missing)} more`}
        </span>
      )}
    </li>
  )
}

/** Spend King Points on real items and balance top-ups */
export default function ItemStorePage() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('featured')
  const { status, user } = useAuth()
  const balance = usePoints()
  const all = useStoreItems()
  const profile = useProfile(Boolean(user))
  const stats = useStoreStats()
  const { toast, show } = useToast(3200)
  const [buying, setBuying] = useState<StoreItem | null>(null)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const found = q ? all.filter((item) => item.name.toLowerCase().includes(q)) : all
    if (sort === 'featured') return found
    return [...found].sort((a, b) => (sort === 'price-asc' ? a.price - b.price : b.price - a.price))
  }, [all, query, sort])

  const buyState = (item: StoreItem): BuyState => {
    if (item.stock === 0) return { kind: 'sold-out' }
    const have = balance.data?.points
    return have !== undefined && have < item.price ? { kind: 'short', missing: item.price - have } : { kind: 'buy' }
  }

  // The store needs a Kick account: that's where King Points live (BotRix)
  const gate = status === 'loading' ? 'loading' : !user ? 'signin' : !user.kick ? 'kick' : null

  return (
    <div className="section-page">
      <div className="store">
        <PageHeading icon={storeIcon} gold="ITEM" rest="STORE">
          Spend your <span className="page-heading__accent">KING POINTS</span> on various Items from IRL to balance top
          ups!
        </PageHeading>

        {gate === 'signin' || gate === 'kick' ? (
          <section className="store-gate">
            <img src={bagSolidGold} width={42.3972} height={44.7352} alt="" />
            <h2 className="store-gate__title">
              {gate === 'signin' ? 'Sign in to use the Item Store' : 'Link your Kick account'}
            </h2>
            <p className="store-gate__text">
              {gate === 'signin'
                ? 'Sign in with Kick to spend the King Points you earn on stream.'
                : 'King Points are earned by watching and chatting on Kick. Link your Kick account to see your balance and shop.'}
            </p>
            <a
              className="kk-button store-gate__button"
              href={gate === 'signin' ? signInUrl('/item-store') : linkKickUrl('/item-store')}
            >
              {gate === 'signin' ? 'Sign in' : 'Link Kick'}
            </a>
          </section>
        ) : gate === null ? (
          <>
            <ul className="store-stats">
              <li className="store-stat">
                <span className="store-stat__text">
                  <span className="store-stat__label">Most Redeemed Item</span>
                  <span className="store-stat__value">{stats?.mostRedeemed?.name ?? 'None yet'}</span>
                </span>
                <StatSymbol variant="bag" image={statImage(stats?.mostRedeemed?.image)} />
              </li>
              <li className="store-stat">
                <span className="store-stat__text">
                  <span className="store-stat__label">Biggest Purchase</span>
                  <span className="store-stat__value">{stats?.biggestPurchase?.name ?? 'None yet'}</span>
                </span>
                <StatSymbol variant="bag" image={statImage(stats?.biggestPurchase?.image)} />
              </li>
              <li className="store-stat">
                <span className="store-stat__text">
                  <span className="store-stat__label">Total Spent</span>
                  <span className="store-stat__value">
                    <img src={coinIcon} width={16} height={16} alt="" />
                    {points(stats?.totalSpent ?? 0)}
                    <span className="visually-hidden"> King Points</span>
                  </span>
                </span>
                <StatSymbol variant="coin" />
              </li>
              <li className="store-stat">
                <span className="store-stat__text">
                  <span className="store-stat__label">Total Items Sold</span>
                  <span className="store-stat__value">
                    {points(stats?.itemsSold ?? 0)} {stats?.itemsSold === 1 ? 'Item' : 'Items'}
                  </span>
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
                  <StoreCard key={item.id} item={item} buy={buyState(item)} onBuy={setBuying} />
                ))}
              </ul>
            ) : (
              <p className="store__empty">
                {query.trim() ? `No items match “${query.trim()}”.` : 'The store is being restocked. Check back soon.'}
              </p>
            )}
          </>
        ) : null}
      </div>
      <RedeemDialog
        item={buying}
        available={balance.data?.points ?? null}
        onClose={() => setBuying(null)}
        onDone={(message, left) => {
          setBuying(null)
          show(message)
          profile.refresh()
          // BotRix's leaderboard can lag: show the new balance now, then re-read it shortly after
          if (left !== null) setPointsBalance(left)
          window.setTimeout(refreshPoints, 15_000)
          refreshStoreStats()
        }}
      />
      <Toast toast={toast} />
    </div>
  )
}

const statImage = (src: string | null | undefined) =>
  src ? { src, ...(STAT_IMAGE_BOX[src] ?? DEFAULT_STAT_IMAGE_BOX) } : undefined

type StoreStats = {
  mostRedeemed: { name: string; image: string | null } | null
  biggestPurchase: { name: string; image: string | null } | null
  totalSpent: number
  itemsSold: number
}

let statsListeners: ((s: StoreStats) => void)[] = []
function refreshStoreStats() {
  fetch('/api/shop/stats', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: StoreStats | null) => s && statsListeners.forEach((l) => l(s)))
    .catch(() => undefined)
}

/** Most redeemed, biggest purchase, points spent and items sold, from delivered redemptions */
function useStoreStats() {
  const [stats, setStats] = useState<StoreStats | null>(null)
  useEffect(() => {
    statsListeners.push(setStats)
    refreshStoreStats()
    return () => {
      statsListeners = statsListeners.filter((l) => l !== setStats)
    }
  }, [])
  return stats
}

/** Confirm a redemption; an admin delivers it and takes the points in BotRix */
function RedeemDialog({
  item,
  available,
  onClose,
  onDone,
}: {
  item: StoreItem | null
  available: number | null
  onClose: () => void
  onDone: (message: string, pointsLeft: number | null) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (item && !dialog.open) {
      setError(null)
      dialog.showModal()
    }
    if (!item && dialog.open) dialog.close()
  }, [item])

  const confirm = async () => {
    if (!item) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/redeem', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; points?: number }
      if (!res.ok) setError(body.error ?? 'Could not send the request. Please try again.')
      else onDone(`${item.name} requested! Track it on your account page.`, typeof body.points === 'number' ? body.points : null)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const art = item ? TIER_ART[item.tier] : null
  const close = () => ref.current?.close()

  return (
    <dialog
      ref={ref}
      className="store-confirm"
      aria-labelledby="store-confirm-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && close()}
    >
      {item && art && (
        <div className="store-confirm__body">
          <header className="store-confirm__head">
            <button type="button" className="store-confirm__back" aria-label="Back to the store" onClick={close}>
              <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden>
                <path d="M6.5 1.5 1.5 6.5l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2 id="store-confirm-title" className="store-confirm__title">
              Confirm Purchase
            </h2>
          </header>

          <div className="store-confirm__item">
            <span className="store-confirm__thumb" style={{ backgroundImage: `url(${art.bg})` }} aria-hidden>
              {item.image ? (
                <img src={item.image} alt="" />
              ) : (
                <img className="store-confirm__bag" src={art.bag} width={26} height={29} alt="" />
              )}
            </span>
            <span className="store-confirm__info">
              <span className="store-confirm__name" title={item.name}>
                {item.name}
              </span>
              {item.description && <span className="store-confirm__description">{item.description}</span>}
            </span>
          </div>

          <dl className="store-confirm__rows">
            <div className="store-confirm__row">
              <dt>Price</dt>
              <dd>
                <img src={coinIcon} width={16} height={16} alt="" />
                {points(item.price)}
              </dd>
            </div>
            <div className="store-confirm__row">
              <dt>Balance</dt>
              <dd>
                <img src={coinIcon} width={16} height={16} alt="" />
                {available !== null ? points(available) : '—'}
              </dd>
            </div>
          </dl>

          {error && (
            <p className="store-confirm__error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className={`kk-button kk-button--${item.tier} store-confirm__purchase`}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Purchasing…' : 'Purchase'}
          </button>
        </div>
      )}
    </dialog>
  )
}
