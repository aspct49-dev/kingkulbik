import { memo } from 'react'
import coinIcon from '../../assets/coin.svg'
import { formatMultiplier } from '../../games/coinflip/engine'
import type { Side } from '../../games/coinflip/engine'
import { cappedPayout, coinflipMultiplier } from '../../../shared/originals'
import type { GameRules } from '../../../shared/originals'
import AnimatedNumber from '../AnimatedNumber'
import { formatPoints } from '../keno/format'
import '../BetPanel.css'
import './CoinflipControls.css'

type CoinflipControlsProps = {
  betInput: string
  onBetInputChange: (value: string) => void
  onBetBlur: () => void
  onHalve: () => void
  onDouble: () => void
  /** The running game (null before Bet) */
  game: { bet: number; streak: number } | null
  flipping: boolean
  /** The side called for the flip in the air */
  calling: Side | null
  rules: GameRules
  onCall: (side: Side) => void
  onRandomPick: () => void
  onBet: () => void
  onCashout: () => void
  canBet: boolean
  error: string | null
  balance: number
  onResetBalance: () => void
}

function SideIcon({ side }: { side: Side }) {
  return <span className={`coinflip-icon coinflip-icon--${side}`} aria-hidden />
}

export default memo(function CoinflipControls(props: CoinflipControlsProps) {
  const { game, flipping, rules } = props
  const playing = !!game
  const locked = playing || flipping
  const streak = game?.streak ?? 0
  const multiplier = coinflipMultiplier(streak, rules.houseEdge)
  const cashout = game ? cappedPayout(game.bet, multiplier, rules.maxWin) : 0
  const canCall = playing && !flipping

  return (
    <div className="bet-panel">
      <label className="bet-panel__label" htmlFor="coinflip-bet">
        Bet Amount
      </label>
      <div className="bet-field">
        <img src={coinIcon} width={14} height={14} alt="" />
        <input
          id="coinflip-bet"
          inputMode="decimal"
          autoComplete="off"
          value={props.betInput}
          disabled={locked}
          onChange={(e) => props.onBetInputChange(e.target.value)}
          onBlur={props.onBetBlur}
        />
        <div className="bet-field__actions">
          <button type="button" onClick={props.onHalve} disabled={locked} aria-label="Halve bet">
            ½
          </button>
          <span className="bet-field__divider" aria-hidden />
          <button type="button" onClick={props.onDouble} disabled={locked} aria-label="Double bet">
            2x
          </button>
        </div>
      </div>

      {playing ? (
        <button
          type="button"
          className="bet-panel__bet bet-panel__bet--cashout"
          onClick={props.onCashout}
          disabled={flipping || streak === 0}
        >
          Cashout
          {streak > 0 && (
            <span className="bet-panel__bet-amount">
              <img src={coinIcon} width={15} height={15} alt="" />
              <AnimatedNumber value={cashout} format={formatPoints} duration={450} />
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="bet-panel__bet" onClick={props.onBet} disabled={!props.canBet}>
          Bet
        </button>
      )}

      <button type="button" className="bet-panel__secondary" onClick={props.onRandomPick} disabled={!canCall}>
        Random Pick
      </button>

      <div className="coinflip-sides" role="group" aria-label="Call heads or tails">
        {(['heads', 'tails'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={`coinflip-side${props.calling === side ? ' coinflip-side--active' : ''}`}
            onClick={() => props.onCall(side)}
            disabled={!canCall}
          >
            {side === 'heads' ? 'Heads' : 'Tails'}
            <SideIcon side={side} />
          </button>
        ))}
      </div>

      <span className="bet-panel__label bet-panel__label--spaced">
        Total Profit ({formatMultiplier(playing && streak > 0 ? multiplier : coinflipMultiplier(1, rules.houseEdge))}×)
      </span>
      <div className="bet-field bet-field--readonly" aria-live="polite">
        <img src={coinIcon} width={14} height={14} alt="" />
        <AnimatedNumber value={playing ? Math.max(0, cashout - game.bet) : 0} format={formatPoints} duration={450} />
      </div>
      {props.error && (
        <p className="bet-panel__error" role="alert">
          {props.error}
        </p>
      )}

      <div className="bet-panel__balance">
        <span>Demo balance</span>
        <span className="bet-panel__balance-value">
          <img src={coinIcon} width={13} height={13} alt="" />
          <AnimatedNumber value={props.balance} format={formatPoints} duration={500} />
        </span>
        {props.balance < rules.minBet && !locked && (
          <button type="button" className="bet-panel__reset" onClick={props.onResetBalance}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
})
