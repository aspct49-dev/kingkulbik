import type { GameRules } from '../../shared/originals'
import { formatKingPoints } from '../games/originals'

/** Under the bet field: the game's largest bet and largest win, in King Points */
export default function BetLimits({ rules }: { rules: Pick<GameRules, 'maxBet' | 'maxWin'> }) {
  return (
    <p className="bet-panel__limits">
      <span>
        Max bet <strong>{formatKingPoints(rules.maxBet)}</strong>
      </span>
      <span aria-hidden>·</span>
      <span>
        Max win <strong>{formatKingPoints(rules.maxWin)}</strong>
      </span>
    </p>
  )
}
