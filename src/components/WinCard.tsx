import coinIcon from '../assets/coin.svg'
import AnimatedNumber from './AnimatedNumber'
import { formatPoints } from './keno/format'
import './WinCard.css'

type WinCardProps = {
  /** Already formatted, e.g. "3.96" (the × is added here) */
  multiplier: string
  payout: number
  /** Positions the card over the game (each game centres it on its own play area) */
  className?: string
}

/** The card that pops up over a game after a win: multiplier, then the payout counting up */
export default function WinCard({ multiplier, payout, className = '' }: WinCardProps) {
  return (
    <div className={`win-card ${className}`} role="status" aria-label={`Won ${formatPoints(payout)} points`}>
      <span className="win-card__multiplier">{multiplier}×</span>
      <span className="win-card__divider" />
      <span className="win-card__payout">
        <img src={coinIcon} width={14} height={14} alt="" />
        <AnimatedNumber value={payout} format={formatPoints} duration={600} from={0} />
      </span>
    </div>
  )
}
