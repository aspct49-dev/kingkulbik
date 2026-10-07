import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import bg from '../assets/rewards-page/bg.webp'
import hexagon from '../assets/rewards-page/hexagon.svg'
import arrow from '../assets/rewards-page/arrow.svg'
import iconDiamond from '../assets/rewards-page/icon-diamond.svg'
import iconStar from '../assets/rewards-page/icon-star.svg'
import iconTicket from '../assets/rewards-page/icon-ticket.svg'
import iconTrophy from '../assets/rewards-page/icon-trophy.svg'
import symbolCoin from '../assets/leaderboard/symbol-coin.webp'
import symHigh3b from '../assets/rewards-page/sym-high3b.webp'
import symHammer from '../assets/rewards-page/sym-hammer.webp'
import sym72 from '../assets/rewards-page/sym-72.webp'
import sym71 from '../assets/rewards-page/sym-71.webp'
import symM2 from '../assets/rewards-page/sym-m2.webp'
import symWagon from '../assets/rewards-page/sym-wagon.webp'
import FloatingSymbol from '../components/FloatingSymbol'
import StakeActions from '../components/StakeActions'
import { STAKE_URL, socials } from '../data/links'
import './ChallengesPage.css'
import './RewardsPage.css'

type Reward = {
  ribbon: string
  /** The hexagon's contents (or the whole icon, hexagon included) */
  icon: ReactNode
  top: string
  main: string
  /** Two lines, as in the design */
  text: [string, string]
  cta: string
  /** A page on the site, or an outside link */
  to: string
}

const BigFigure = ({ children, size }: { children: string; size: 'big' | 'mid' }) => (
  <>
    <img className="bonus-card__hexagon" src={hexagon} width={245.813} height={237.76} alt="" />
    <span className={`bonus-card__figure bonus-card__figure--${size}`}>{children}</span>
  </>
)

const REWARDS: Reward[] = [
  {
    ribbon: 'PAID INSTANTLY EVERY SATURDAY',
    icon: <BigFigure size="big">3x</BigFigure>,
    top: 'TRIPLED',
    main: 'WEEKLY',
    text: ['Claim 3x the standard amount', 'after collecting your weekly bonus.'],
    cta: 'Claim now',
    to: socials.discord.url,
  },
  {
    ribbon: '10% PAID EVERY SATURDAY',
    icon: <BigFigure size="mid">10%</BigFigure>,
    top: '10% WEEKLY',
    main: 'LOSSBACK',
    text: ['Claim weekly resseting lossback', 'based on your recent loses.'],
    cta: 'Claim now',
    to: socials.discord.url,
  },
  {
    ribbon: 'PAID UPON REACHING RANK UP',
    icon: (
      <>
        <img className="bonus-card__hexagon" src={hexagon} width={245.813} height={237.76} alt="" />
        <img className="bonus-card__star" src={iconStar} width={114} height={114} alt="" />
      </>
    ),
    top: 'WAGER',
    main: 'MILESTONES',
    text: ['Claim extra reward upon rank', 'up & track your wager.'],
    cta: 'Milestones',
    to: '/milestones',
  },
  {
    ribbon: 'BONUS UNLOCKED AFTER SIGN UP',
    icon: (
      <>
        <img className="bonus-card__hexagon" src={hexagon} width={245.813} height={237.76} alt="" />
        <img className="bonus-card__diamond" src={iconDiamond} width={136} height={136} alt="" />
      </>
    ),
    top: 'SIGN UP FOR',
    main: 'FREE $21',
    text: ['Get 200% Deposit Match', '& Free $21 Reload.'],
    cta: 'Visit Stake',
    to: STAKE_URL,
  },
  {
    ribbon: '5+ WINNERS EVERY WEEK',
    icon: <img className="bonus-card__hexagon" src={iconTicket} width={245.813} height={237.76} alt="" />,
    top: 'WEEKLY',
    main: 'RAFFLES',
    text: ['$1,000 Raffle every week', '5 Winners x $200.'],
    cta: 'Visit Raffles',
    to: '/raffles',
  },
  {
    ribbon: 'PAID INSTANTLY EVERY SATURDAY',
    icon: <img className="bonus-card__hexagon" src={iconTrophy} width={245.813} height={237.76} alt="" />,
    top: 'EXCLUSIVE',
    main: '$40K RACE',
    text: ['Climb the ranks & secure top', 'places for big prizes!'],
    cta: 'Leaderboard',
    to: '/leaderboard',
  },
]

const EXTRAS = [
  { title: 'Daily Juices', text: 'To my viewers' },
  { title: 'Bonus Buys', text: 'Win = Get Tipped' },
  { title: 'Giveaways', text: 'During every stream' },
]

/**
 * The slot symbols scattered over the background, placed from the centre of
 * the page column as in the design: outer box, image size, turn, opacity.
 */
const SYMBOLS: {
  src: string
  left: number
  top: number
  box: [number, number]
  size: number | { width: number; height: number }
  rotation: number
  opacity: number
}[] = [
  { src: symHigh3b, left: 208.5, top: -112, box: [200.967, 200.967], size: 163.978, rotation: 15.07, opacity: 0.1 },
  { src: symbolCoin, left: -659.5, top: 103, box: [73.925, 76.1], size: { width: 63.329, height: 66.017 }, rotation: -10.1, opacity: 0.43 },
  { src: symHammer, left: 638.5, top: 327, box: [90.756, 90.756], size: 75.543, rotation: 13.16, opacity: 1 },
  { src: sym72, left: -556.5, top: 463, box: [216.867, 216.867], size: 153.489, rotation: -42.55, opacity: 0.08 },
  { src: symM2, left: 359.5, top: 716, box: [227.159, 227.159], size: 188.993, rotation: -13.2, opacity: 0.04 },
  { src: sym71, left: -727.5, top: 839, box: [105.46, 105.46], size: 90, rotation: -10.95, opacity: 0.51 },
  { src: symWagon, left: 635.5, top: 1173, box: [93.776, 91.716], size: { width: 77.183, height: 74.27 }, rotation: -15, opacity: 0.32 },
]

/** Kulbik Rewards: every reward for playing under the code, each with where to claim it */
export default function RewardsPage() {
  return (
    <div className="section-page rewards-hub-page">
      <img className="rewards-hub__bg" src={bg} width={1665} height={960} alt="" />
      {SYMBOLS.map((s, i) => (
        <FloatingSymbol
          key={i}
          className="rewards-hub__symbol"
          src={s.src}
          size={s.size}
          rotation={s.rotation}
          style={
            {
              left: `calc(50% + ${s.left}px)`,
              top: s.top,
              width: s.box[0],
              height: s.box[1],
              opacity: s.opacity,
            } as CSSProperties
          }
        />
      ))}

      <div className="rewards-hub">
        <header className="rewards-hub__head">
          <h1 className="rewards-hub__title">
            <span className="rewards-hub__title-top">KULBIK</span>
            <span className="rewards-hub__title-main">REWARDS</span>
          </h1>
          <p className="rewards-hub__subtitle">
            Play under code <span className="rewards-hub__accent">KingKulbik</span> &amp; you’ll be eligible for all the
            Rewards below!
          </p>
          <StakeActions className="rewards-hub__actions" />
        </header>

        <ul className="rewards-hub__grid">
          {REWARDS.map((r) => (
            <li key={r.main} className="bonus-card">
              <span className="bonus-card__ribbon">{r.ribbon}</span>
              <div className="bonus-card__box">
                <div className="bonus-card__icon" aria-hidden>
                  {r.icon}
                </div>
                <h2 className="bonus-card__name">
                  <span className="bonus-card__name-top">{r.top}</span>
                  <span className="bonus-card__name-main">{r.main}</span>
                </h2>
                <p className="bonus-card__text">
                  {r.text[0]}
                  <br />
                  {r.text[1]}
                </p>
                <CardLink to={r.to}>
                  {r.cta}
                  <img className="bonus-card__arrow" src={arrow} width={8.64349} height={5.53846} alt="" />
                </CardLink>
              </div>
            </li>
          ))}
        </ul>

        <ul className="rewards-hub__extras">
          {EXTRAS.map((x) => (
            <li key={x.title}>
              <span className="rewards-hub__extra-title">{x.title}</span>
              <span className="rewards-hub__extra-text">{x.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  const className = 'kk-button bonus-card__button'
  return to.startsWith('/') ? (
    <Link className={className} to={to}>
      {children}
    </Link>
  ) : (
    <a className={className} href={to} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
