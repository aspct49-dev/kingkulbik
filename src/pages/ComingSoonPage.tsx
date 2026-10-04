import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import kickIcon from '../assets/sidebar/kick.svg'
import Wordmark from '../components/Wordmark'
import { socials } from '../data/links'
import './ComingSoonPage.css'

/** Where the artwork sits inside its card-sized image, as fractions (x, y, width, height) */
export type ArtBox = [number, number, number, number]

type ComingSoonPageProps = {
  /** e.g. "Bonus Hunt" */
  title: string
  /** The game's card art (full card size, transparent around the artwork) */
  art: string
  /** The part of `art` to show, so the page is not padded with empty card space */
  artBox: ArtBox
  blurb: string
  /** Fade the art's edges (for art drawn on its own backdrop, like the Bonus Hunt tiles) */
  softEdges?: boolean
}

/** The card images are 578 × 769 */
const CARD_ASPECT = 578 / 769

/** Placeholder for a section that is not live yet, in the site's look */
export default function ComingSoonPage({ title, art, artBox, blurb, softEdges = false }: ComingSoonPageProps) {
  const [x, y, w, h] = artBox
  const artStyle = {
    '--art-x': x,
    '--art-y': y,
    '--art-w': w,
    '--art-h': h,
    aspectRatio: `${(w * CARD_ASPECT) / h}`,
  } as CSSProperties

  return (
    <div className="coming-soon">
      <div className="coming-soon__glow" aria-hidden />
      <div className="coming-soon__grid" aria-hidden />

      <div className="coming-soon__content">
        <div className={`coming-soon__art${softEdges ? ' coming-soon__art--soft' : ''}`} style={artStyle} aria-hidden>
          <img src={art} alt="" />
        </div>

        <div className="coming-soon__text">
          <Wordmark className="coming-soon__wordmark" outline={false} />
          <h1 className="coming-soon__title">
            <span className="coming-soon__kicker">{title}</span>
            <span className="coming-soon__headline">Coming Soon</span>
          </h1>
          <p className="coming-soon__blurb">{blurb}</p>

          <div className="coming-soon__actions">
            <Link className="coming-soon__button coming-soon__button--dark" to="/">
              Back to Home
            </Link>
            <a
              className="coming-soon__button coming-soon__button--gold"
              href={socials.kick.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={kickIcon} width={12} height={15} alt="" />
              Watch on Kick
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
