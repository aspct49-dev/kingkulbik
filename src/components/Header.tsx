import { Link } from 'react-router'
import dividerLine from '../assets/sidebar/divider.svg'
import './Header.css'

type HeaderProps = {
  className?: string
  menuOpen: boolean
  onMenuToggle: () => void
}

export default function Header({ className = '', menuOpen, onMenuToggle }: HeaderProps) {
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
        <span className="header__logo-king">KING</span>{' '}
        <span className="header__logo-kulbik">KULBIK</span>
      </Link>
      <span className="header__divider" aria-hidden>
        <img src={dividerLine} width={35} height={1} alt="" />
      </span>
      <div className="header__auth">
        <button type="button" className="header__sign-in">
          Sign in
        </button>
        <button type="button" className="header__register">
          Register
        </button>
      </div>
    </header>
  )
}
