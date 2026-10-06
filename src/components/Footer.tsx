import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import gambleAware from '../assets/footer/gambleaware.png'
import { STAKE_CODE, STAKE_URL, socials } from '../data/links'
import './Footer.css'

const KickIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z"
    />
  </svg>
)

const DiscordIcon = () => (
  <svg viewBox="0 0 640 512" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6,447.848,447.848,0,0,0-134.426,0,309.541,309.541,0,0,0-15.135-30.6,1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588,321.173,321.173,0,0,1-45.868-21.853,1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126,301.407,301.407,0,0,1-45.89,21.83,1.875,1.875,0,0,0-1,2.611,391.055,391.055,0,0,0,30.014,48.815,1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z"
    />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"
    />
  </svg>
)

type SocialLink = { label: string; url: string; brand: string; icon: ReactNode }

const socialLinks: SocialLink[] = [
  { label: socials.kick.label, url: socials.kick.url, brand: '#53fc18', icon: <KickIcon /> },
  { label: socials.discord.label, url: socials.discord.url, brand: '#5865f2', icon: <DiscordIcon /> },
  { label: socials.x.label, url: socials.x.url, brand: '#eaf2ff', icon: <XIcon /> },
]

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__card">
      <div className="footer__top">
        <div className="footer__brand">
          <Link to="/" className="footer__logo" aria-label="King Kulbik home">
            <span className="footer__logo-king">KING</span>{' '}
            <span className="footer__logo-kulbik">KULBIK</span>
          </Link>

          <div className="footer__marks">
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer">
              <img className="footer__aware" src={gambleAware} alt="BeGambleAware" width={163} height={24} />
            </a>
            <span className="footer__age">18+</span>
          </div>

          <p className="footer__note">
            We take no responsibility for losses at any casino linked or promoted here. You are responsible
            for your own bets. King Kulbik is a community leaderboard for Stake players under the code{' '}
            <strong>{STAKE_CODE}</strong>. It is not a casino, and it is not operated by Stake.
          </p>

          <div className="footer__icons" aria-label="Social media">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                style={{ '--brand': link.brand } as CSSProperties}
              >
                {link.icon}
              </a>
            ))}
          </div>
        </div>

        <nav className="footer__col" aria-label="Explore">
          <h4>Explore</h4>
          <Link to="/">Home</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/keno">Keno</Link>
          <Link to="/coinflip">Coinflip</Link>
          <Link to="/rewards">Rewards</Link>
          <Link to="/item-store">Item Store</Link>
          <a href={STAKE_URL} target="_blank" rel="noopener noreferrer">
            Visit Stake
          </a>
        </nav>

        <nav className="footer__col" aria-label="Social media links">
          <h4>Social Media</h4>
          {socialLinks.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ '--brand': link.brand } as CSSProperties}
            >
              {link.icon}
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="footer__legal">
        <span className="footer__copyright">© {new Date().getFullYear()} King Kulbik - All Rights Reserved.</span>
        <span className="footer__responsible">18+ only · Gamble responsibly</span>
      </div>
      </div>
    </footer>
  )
}
