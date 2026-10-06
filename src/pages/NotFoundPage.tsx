import { Link } from 'react-router'
import Wordmark from '../components/Wordmark'
import './ComingSoonPage.css'

/** Unknown address: same frame as the Coming Soon pages */
export default function NotFoundPage() {
  return (
    <div className="coming-soon">
      <div className="coming-soon__glow" aria-hidden />
      <div className="coming-soon__grid" aria-hidden />
      <div className="coming-soon__content coming-soon__content--center">
        <div className="coming-soon__text">
          <Wordmark className="coming-soon__wordmark" outline={false} />
          <h1 className="coming-soon__title">
            <span className="coming-soon__kicker">Page not found</span>
            <span className="coming-soon__headline">404</span>
          </h1>
          <p className="coming-soon__blurb">That page doesn't exist, or it has moved.</p>
          <div className="coming-soon__actions">
            <Link className="coming-soon__button coming-soon__button--gold" to="/">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
