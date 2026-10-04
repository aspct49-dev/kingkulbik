import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import homeActiveIcon from '../assets/sidebar/home.svg'
import homeIcon from '../assets/sidebar/home-inactive.svg'
import leaderboardIcon from '../assets/sidebar/leaderboard.svg'
import leaderboardActiveIcon from '../assets/sidebar/leaderboard-active.svg'
import rewardsIcon from '../assets/sidebar/rewards.svg'
import challengesIcon from '../assets/sidebar/challenges.svg'
import rafflesIcon from '../assets/sidebar/raffles.svg'
import itemStoreIcon from '../assets/sidebar/item-store.svg'
import bonusHuntIcon from '../assets/sidebar/bonus-hunt.svg'
import coinflipIcon from '../assets/sidebar/coinflip.svg'
import videocamIcon from '../assets/sidebar/videocam.svg'
import kickIcon from '../assets/sidebar/kick.svg'
import xIcon from '../assets/sidebar/x.svg'
import discordIcon from '../assets/sidebar/discord.svg'
import { socials } from '../data/links'
import './Sidebar.css'

type NavItem = {
  label: string
  /** Routes start with "/"; anything else is a placeholder link. */
  href: string
  icon: ReactNode
  activeIcon?: ReactNode
}

type NavSection = {
  title?: string
  items: NavItem[]
}

const svgIcon = (src: string, width: number, height: number) => (
  <img src={src} width={width} height={height} alt="" />
)

const numberIcon = <span className="sidebar__number-icon">3</span>

const sections: NavSection[] = [
  {
    items: [
      {
        label: 'Home',
        href: '/',
        icon: svgIcon(homeIcon, 17, 16),
        activeIcon: svgIcon(homeActiveIcon, 17, 16),
      },
      {
        label: 'Leaderboard',
        href: '/leaderboard',
        icon: svgIcon(leaderboardIcon, 16, 14),
        activeIcon: svgIcon(leaderboardActiveIcon, 16, 14),
      },
    ],
  },
  {
    title: 'VIP Program',
    items: [
      { label: 'Rewards', href: '#rewards', icon: svgIcon(rewardsIcon, 21, 21) },
      { label: 'Challenges', href: '#challenges', icon: svgIcon(challengesIcon, 16, 16) },
      { label: 'Raffles', href: '#raffles', icon: svgIcon(rafflesIcon, 16, 16) },
      { label: 'Item Store', href: '#item-store', icon: svgIcon(itemStoreIcon, 16, 16) },
    ],
  },
  {
    title: 'Games',
    items: [
      { label: 'Bonus Hunt', href: '/bonus-hunt', icon: svgIcon(bonusHuntIcon, 19, 19) },
      {
        label: 'Guess the Balance',
        href: '/guess-the-balance',
        icon: <span className="sidebar__question-icon">?</span>,
      },
      { label: 'Coinflip', href: '/coinflip', icon: svgIcon(coinflipIcon, 17, 17) },
      { label: 'Keno', href: '/keno', icon: numberIcon },
    ],
  },
  {
    title: 'Socials & Media',
    items: [
      { label: 'Socials & Video', href: '#socials', icon: svgIcon(videocamIcon, 17, 17) },
      { label: 'Watch live now', href: socials.kick.url, icon: svgIcon(kickIcon, 12, 15) },
      { label: 'Follow on X', href: socials.x.url, icon: svgIcon(xIcon, 15, 14) },
      { label: 'Join Discord', href: socials.discord.url, icon: svgIcon(discordIcon, 19, 14) },
    ],
  },
]

function SidebarLink({ label, href, icon, activeIcon }: NavItem) {
  if (!href.startsWith('/')) {
    return (
      <a
        href={href}
        className="sidebar__item"
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        <span className="sidebar__icon">{icon}</span>
        {label}
      </a>
    )
  }

  return (
    <NavLink
      to={href}
      end
      className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
    >
      {({ isActive }) => (
        <>
          <span className="sidebar__icon">{isActive && activeIcon ? activeIcon : icon}</span>
          {label}
        </>
      )}
    </NavLink>
  )
}

type SidebarProps = {
  /** Mobile drawer state; on desktop the sidebar is always shown. */
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  // While the drawer is open: Escape closes it and the page behind can't scroll
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.documentElement.classList.add('has-drawer-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('has-drawer-open')
    }
  }, [open, onClose])

  return (
    <>
      <div className={`sidebar__backdrop${open ? ' sidebar__backdrop--visible' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`sidebar${open ? ' sidebar--open' : ''}`} id="site-nav">
        <nav className="sidebar__nav" aria-label="Main">
          {sections.map((section, i) => (
            <div className="sidebar__section" key={section.title ?? i}>
              {section.title && <p className="sidebar__section-title">{section.title}</p>}
              <ul className="sidebar__list">
                {section.items.map((item) => (
                  <li key={item.label}>
                    <SidebarLink {...item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
