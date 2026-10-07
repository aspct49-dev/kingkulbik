import stakeLogoDark from '../assets/leaderboard/stake-logo-dark.svg'
import CopyCodeButton from './CopyCodeButton'
import { STAKE_URL } from '../data/links'
import './StakeActions.css'

/** "Code: Kingkulbik" (copies it) and the gold "Visit Stake" button, as on the leaderboard and rewards pages */
export default function StakeActions({ className = '' }: { className?: string }) {
  return (
    <div className={`stake-actions ${className}`}>
      <CopyCodeButton className="stake-actions__code" />
      <a className="stake-actions__visit" href={STAKE_URL} target="_blank" rel="noopener noreferrer">
        Visit
        <img src={stakeLogoDark} width={35} height={17} alt="Stake" />
      </a>
    </div>
  )
}
