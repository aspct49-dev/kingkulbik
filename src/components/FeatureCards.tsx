import type { ReactNode } from 'react'
import { Link } from 'react-router'
import cardBg1 from '../assets/features/card-bg-1.png'
import cardBg2 from '../assets/features/card-bg-2.png'
import cardMask from '../assets/features/card-mask.png'
import giftImg from '../assets/features/gift.png'
import cartImg from '../assets/features/cart.png'
import trophyImg from '../assets/features/trophy.png'
import ticketImg from '../assets/features/ticket.png'
import arrowIcon from '../assets/features/arrow.svg'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './FeatureCards.css'

type Feature = {
  kicker: string
  title: string
  cta: string
  href: string
  art: ReactNode
}

const features: Feature[] = [
  {
    kicker: 'CLAIM YOUR',
    title: 'BONUSES',
    cta: 'REWARDS',
    href: '#rewards',
    art: <img className="feature-card__gift" src={giftImg} alt="" />,
  },
  {
    kicker: 'TURN POINTS',
    title: 'INTO ITEMS',
    cta: 'ITEM STORE',
    href: '#item-store',
    art: (
      <div className="feature-card__cart">
        <div className="feature-card__cart-frame">
          <img src={cartImg} alt="" />
        </div>
      </div>
    ),
  },
  {
    kicker: 'COMPETE FOR',
    title: 'TOP PLACES',
    cta: 'LEADERBOARD',
    href: '/leaderboard',
    art: (
      <div className="feature-card__trophy">
        <img src={trophyImg} alt="" />
      </div>
    ),
  },
  {
    kicker: 'JOIN',
    title: 'GIVEAWAYS',
    cta: 'RAFFLES',
    href: '#raffles',
    art: (
      <div className="feature-card__ticket">
        <img src={ticketImg} alt="" />
      </div>
    ),
  },
]

function ArrowIcon() {
  return (
    <span className="feature-card__arrow" aria-hidden>
      <span className="feature-card__arrow-inner">
        <img src={arrowIcon} width={8.64349} height={5.53846} alt="" />
      </span>
    </span>
  )
}

function FeatureCard({ kicker, title, cta, href, art }: Feature) {
  const { phase, handlers } = useHoverAnimation()

  return (
    <article className={`feature-card hover-anim hover-anim--${phase}`} {...handlers}>
      <img className="feature-card__bg" src={cardBg1} alt="" />
      <div className="feature-card__bg feature-card__bg--gradient" />
      <img className="feature-card__bg" src={cardBg2} alt="" />
      <div className="feature-card__glow" aria-hidden />
      <div
        className="feature-card__art"
        style={{ maskImage: `url("${cardMask}")`, WebkitMaskImage: `url("${cardMask}")` }}
      >
        <div className="feature-card__art-motion">{art}</div>
      </div>
      <div className="feature-card__content">
        <h2 className="feature-card__heading">
          <span className="feature-card__kicker">{kicker}</span>
          <span className="feature-card__title">{title}</span>
        </h2>
        <Link className="feature-card__cta" to={href}>
          {cta}
          <ArrowIcon />
        </Link>
      </div>
    </article>
  )
}

export default function FeatureCards() {
  return (
    <section className="feature-cards" aria-label="Site features">
      {features.map((feature) => (
        <FeatureCard key={feature.title} {...feature} />
      ))}
    </section>
  )
}
