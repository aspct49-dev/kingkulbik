import { Link } from 'react-router'
import bg1 from '../assets/banner/bg-1.png'
import bg2 from '../assets/banner/bg-2.png'
import logo from '../assets/banner/logo.png'
import boxRewards from '../assets/banner/box-rewards.svg'
import boxItemStore from '../assets/banner/box-item-store.svg'
import boxLeaderboard from '../assets/banner/box-leaderboard.svg'
import boxGames from '../assets/banner/box-games.svg'
import iconRewards from '../assets/banner/icon-rewards.svg'
import iconItemStore from '../assets/banner/icon-item-store.svg'
import iconLeaderboard from '../assets/banner/icon-leaderboard.svg'
import iconGames from '../assets/banner/icon-games.svg'
import './HeroBanner.css'

type Pill = {
  label: string
  href: string
  box: string
  width: number
  icon: string
  iconWidth: number
}

const leftPills: Pill[] = [
  { label: 'Rewards', href: '#rewards', box: boxRewards, width: 120, icon: iconRewards, iconWidth: 14.1176 },
  { label: 'Item Store', href: '#item-store', box: boxItemStore, width: 131, icon: iconItemStore, iconWidth: 15.1154 },
]

const rightPills: Pill[] = [
  { label: 'Leaderboard', href: '/leaderboard', box: boxLeaderboard, width: 144, icon: iconLeaderboard, iconWidth: 15.1049 },
  { label: 'Games', href: '#games', box: boxGames, width: 104, icon: iconGames, iconWidth: 16.1553 },
]

function BannerPill({ label, href, box, width, icon, iconWidth }: Pill) {
  return (
    <Link to={href} className="hero-banner__pill" style={{ width }}>
      <img className="hero-banner__pill-box" src={box} width={width} height={32} alt="" />
      <span className="hero-banner__pill-content">
        <img src={icon} width={iconWidth} height={15} alt="" />
        {label}
      </span>
    </Link>
  )
}

export default function HeroBanner() {
  return (
    <section className="hero-banner">
      <img className="hero-banner__bg" src={bg1} alt="" />
      <img className="hero-banner__bg" src={bg2} alt="" />
      <div className="hero-banner__content">
        <div className="hero-banner__pills hero-banner__pills--left">
          {leftPills.map((pill) => (
            <BannerPill key={pill.label} {...pill} />
          ))}
        </div>
        <img className="hero-banner__logo" src={logo} width={286} height={144} alt="King Kulbik" />
        <div className="hero-banner__pills hero-banner__pills--right">
          {rightPills.map((pill) => (
            <BannerPill key={pill.label} {...pill} />
          ))}
        </div>
      </div>
    </section>
  )
}
