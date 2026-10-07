import { Link } from 'react-router'
import bannerBg from '../assets/rewards/banner-bg.webp'
import stakeLogo from '../assets/leaderboard/stake-logo.svg'
import { socials } from '../data/links'
import { MILESTONES } from '../data/milestones'
import type { Milestone } from '../data/milestones'
import { signInUrl, useAuth, useStakeProgress } from '../hooks/useAuth'
import './ChallengesPage.css'
import './RewardsPage.css'

const usd = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Wager under the code, from the linked Stake account. In development,
 * `?wagered=` on the URL previews other states.
 */
function useWagered() {
  const progress = useStakeProgress()
  const preview = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('wagered')) : NaN
  if (Number.isFinite(preview) && preview > 0) return { wagered: preview, progress }
  return { wagered: progress.data?.wagered ?? 0, progress }
}

/** What's being tracked, or the next step to start tracking */
function TrackingBar({ wagered, loading, failed }: { wagered: number; loading: boolean; failed: boolean }) {
  const { status, user } = useAuth()
  if (status === 'loading') return null
  const next = MILESTONES.find((m) => wagered < m.wager)

  if (!user || !user.stake) {
    return (
      <div className="rewards-track">
        <span className="rewards-track__logo" aria-hidden>
          <img src={stakeLogo} width={35} height={17} alt="" />
        </span>
        <span className="rewards-track__text">
          <span className="rewards-track__title">Track your progress</span>
          <span className="rewards-track__detail">
            {user
              ? 'Link your Stake username to see how close you are to each reward.'
              : 'Sign in and link your Stake username to see how close you are to each reward.'}
          </span>
        </span>
        {user ? (
          <Link className="kk-button rewards-track__action" to="/account">
            Link Stake
          </Link>
        ) : (
          <a className="kk-button rewards-track__action" href={signInUrl('/account')}>
            Sign in
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="rewards-track">
      <span className="rewards-track__logo" aria-hidden>
        <img src={stakeLogo} width={35} height={17} alt="" />
      </span>
      <span className="rewards-track__text">
        <span className="rewards-track__title">
          Tracking <span className="rewards-track__accent">{user.stake.username}</span>
        </span>
        <span className="rewards-track__detail">
          {failed
            ? "Couldn't reach Stake just now. Progress will update shortly."
            : loading
              ? 'Checking your wager…'
              : next
                ? `$${usd(wagered)} wagered · $${usd(next.wager - wagered)} to ${next.rank}`
                : `$${usd(wagered)} wagered · every reward unlocked`}
        </span>
      </span>
    </div>
  )
}

function MilestoneRow({ milestone, wagered, last }: { milestone: Milestone; wagered: number; last: boolean }) {
  const { prefix, rank, tone, wager, prize, icon, badge } = milestone
  const progress = Math.min(1, wagered / wager)
  const reached = progress >= 1

  return (
    <li className={`milestone milestone--${tone}${reached ? ' milestone--reached' : ''}`}>
      <img className="milestone__badge" src={badge} width={64} height={last ? 64 : 86} alt="" aria-hidden />
      <div className="milestone__card">
        <div className="milestone__head">
          <img src={icon} width={18} height={18} alt="" />
          <h2 className="milestone__title">
            {prefix && `${prefix} `}
            <span className="milestone__rank">{rank}</span>
          </h2>
          <span className="milestone__wager">Wager ${wager.toLocaleString('en-US')}</span>
          <span className="milestone__prize">
            Prize: <span className="milestone__accent">$</span>
            <strong>{usd(prize)}</strong>
          </span>
        </div>
        <div
          className="milestone__bar"
          role="progressbar"
          aria-label={`Progress to ${rank}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="milestone__fill" style={{ width: `${progress * 100}%` }} />
        </div>
        {reached ? (
          // Claims are handled in the Discord, like challenge rewards
          <a
            className="kk-button milestone__action"
            href={socials.discord.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Claim
          </a>
        ) : (
          <span className="milestone__action milestone__action--locked">Locked</span>
        )}
      </div>
    </li>
  )
}

/** Rank-up milestones: a prize for each wager tier reached under the code */
export default function RewardsPage() {
  const { wagered, progress } = useWagered()

  return (
    <div className="section-page">
      <div className="rewards">
        {/* The artwork is only the backdrop; the title is live text so it stays sharp */}
        <header className="rewards__banner" style={{ backgroundImage: `url(${bannerBg})` }}>
          <h1 className="rewards__title">
            <span className="rewards__title-top">RANK UP</span>
            <span className="rewards__title-main">MILESTONES</span>
          </h1>
          <p className="visually-hidden">
            Claims must be submitted within seven days of ranking up and are normally paid within 48 hours.
          </p>
        </header>

        <TrackingBar
          wagered={wagered}
          loading={progress.status === 'loading' && !progress.data}
          failed={progress.status === 'error'}
        />

        <ol className="rewards__list">
          {MILESTONES.map((m, i) => (
            <MilestoneRow key={m.id} milestone={m} wagered={wagered} last={i === MILESTONES.length - 1} />
          ))}
        </ol>
      </div>
    </div>
  )
}
