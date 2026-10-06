import { Link, useLocation } from 'react-router'
import dividerLine from '../assets/sidebar/divider.svg'
import coinIcon from '../assets/coin.svg'
import { signInUrl, useAuth, usePoints } from '../hooks/useAuth'
import './Header.css'

type HeaderProps = {
  className?: string
  menuOpen: boolean
  onMenuToggle: () => void
}

export default function Header({ className = '', menuOpen, onMenuToggle }: HeaderProps) {
  const { status, user } = useAuth()
  const points = usePoints()
  // After signing in, come back to the page they were on
  const { pathname } = useLocation()
  const returnTo = pathname

  return (
    <header className={`header ${className}`}>
      <button
        type="button"
        className="header__menu"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        onClick={onMenuToggle}
      >
        <span className={`header__menu-icon${menuOpen ? ' header__menu-icon--open' : ''}`} aria-hidden />
      </button>
      <Link to="/" className="header__logo" aria-label="King Kulbik home">
        <span className="header__logo-king">KING</span> <span className="header__logo-kulbik">KULBIK</span>
      </Link>
      <span className="header__divider" aria-hidden>
        <img src={dividerLine} width={35} height={1} alt="" />
      </span>
      <div className={`header__auth${status === 'loading' ? ' header__auth--loading' : ''}`}>
        {user?.kick && (
          <Link to="/item-store" className="header__points" aria-label="Your King Points">
            <img src={coinIcon} width={16} height={16} alt="" />
            {points.data ? points.data.points.toLocaleString('en-US') : '…'}
          </Link>
        )}
        {user ? (
          <Link to="/account" className="header__user" aria-label={`Your account (${user.discord.name})`}>
            {user.discord.avatar ? (
              <img className="header__avatar" src={user.discord.avatar} width={32} height={32} alt="" />
            ) : (
              <span className="header__avatar header__avatar--blank" aria-hidden>
                {user.discord.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="header__user-name">{user.discord.name}</span>
          </Link>
        ) : (
          <>
            {/* Sign-in is Discord; a full page load, since it leaves the site */}
            <a className="header__sign-in" href={signInUrl(returnTo)}>
              Sign in
            </a>
            <a className="header__register" href={signInUrl(returnTo)}>
              Register
            </a>
          </>
        )}
      </div>
    </header>
  )
}
