import { useMemo } from 'react'
import banner from '../assets/rewards/banner.png'
import Toast, { useToast } from '../components/Toast'
import { MILESTONES } from '../data/milestones'
import type { Milestone } from '../data/milestones'
import './ChallengesPage.css'
import './RewardsPage.css'

const usd = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Wager under the code so far. Comes from the linked Stake account once
 * accounts exist; 0 until then, so every milestone shows as locked.
 * `?wagered=` on the URL previews other states (only for whoever opens it).
 */
function useWagered() {
  return useMemo(() => {
    const preview = Number(new URLSearchParams(window.location.search).get('wagered'))
    return Number.isFinite(preview) && preview > 0 ? preview : 0
  }, [])
}

function MilestoneRow({ milestone, wagered, last, onClaim }: { milestone: Milestone; wagered: number; last: boolean; onClaim: () => void }) {
  const { prefix, rank, tone, wager, prize, icon, badge } = milestone
  const progress = Math.min(1, wagered / wager)
  const reached = progress >= 1

  return (
    <li className={`milestone milestone--${tone}${reached ? ' milestone--reached' : ''}`}>
      <img
        className="milestone__badge"
        src={badge}
        width={64}
        height={last ? 64 : 86}
        alt=""
        aria-hidden
      />
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
          <button type="button" className="kk-button milestone__action" onClick={onClaim}>
            Claim
          </button>
        ) : (
          <span className="milestone__action milestone__action--locked">Locked</span>
        )}
      </div>
    </li>
  )
}

/** Rank-up milestones: a prize for each wager tier reached under the code */
export default function RewardsPage() {
  const wagered = useWagered()
  const { toast, show } = useToast(2400)
  const claim = () => show('Sign in to claim milestone rewards. Accounts are coming soon.')

  return (
    <div className="section-page">
      <div className="rewards">
        <h1 className="rewards__banner">
          <img src={banner} width={925} height={196} alt="Rank up milestones" />
          <span className="visually-hidden">
            Claims must be submitted within seven days of ranking up and are normally paid within 48 hours.
          </span>
        </h1>

        <ol className="rewards__list">
          {MILESTONES.map((m, i) => (
            <MilestoneRow key={m.id} milestone={m} wagered={wagered} last={i === MILESTONES.length - 1} onClaim={claim} />
          ))}
        </ol>
      </div>
      <Toast toast={toast} />
    </div>
  )
}
