import { memo } from 'react'
import coinIcon from '../../assets/keno/coin.png'
import { MULTIPLIER, formatMultiplier, multiplierFor } from '../../games/coinflip/engine'
import type { Side } from '../../games/coinflip/engine'
import AnimatedNumber from '../AnimatedNumber'
import { formatPoints } from '../keno/format'
import './CoinflipControls.css'

export const MIN_BET = 1

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
  const { game, flipping } = props
  const playing = !!game
  const locked = playing
  const streak = game?.streak ?? 0
  const multiplier = multiplierFor(streak)
  const cashout = game ? Math.round(game.bet * multiplier * 100) / 100 : 0
  const canCall = playing && !flipping

  return (
    <div className="coinflip-controls">
      <label className="coinflip-controls__label" htmlFor="coinflip-bet">
        Bet Amount
      </label>
      <div className="coinflip-field">
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
        <div className="coinflip-field__actions">
          <button type="button" onClick={props.onHalve} disabled={locked} aria-label="Halve bet">
            ½
          </button>
          <span className="coinflip-field__divider" aria-hidden />
          <button type="button" onClick={props.onDouble} disabled={locked} aria-label="Double bet">
            2x
          </button>
        </div>
      </div>

      {playing ? (
        <button
          type="button"
          className="coinflip-controls__bet coinflip-controls__bet--cashout"
          onClick={props.onCashout}
          disabled={flipping || streak === 0}
        >
          Cashout
          {streak > 0 && (
            <span className="coinflip-controls__bet-amount">
              <img src={coinIcon} width={15} height={15} alt="" />
              <AnimatedNumber value={cashout} format={formatPoints} duration={450} />
            </span>
          )}
        </button>
      ) : (
        <button type="button" className="coinflip-controls__bet" onClick={props.onBet} disabled={!props.canBet}>
          Bet
        </button>
      )}

      <button type="button" className="coinflip-controls__secondary" onClick={props.onRandomPick} disabled={!canCall}>
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

      <span className="coinflip-controls__label coinflip-controls__label--spaced">
        Total Profit ({formatMultiplier(playing ? multiplier : MULTIPLIER)}×)
      </span>
      <div className="coinflip-field coinflip-field--readonly" aria-live="polite">
        <img src={coinIcon} width={14} height={14} alt="" />
        <AnimatedNumber value={playing ? Math.max(0, cashout - game.bet) : 0} format={formatPoints} duration={450} />
      </div>
      {props.error && (
        <p className="coinflip-controls__error" role="alert">
          {props.error}
        </p>
      )}

      <div className="coinflip-controls__balance">
        <span>Demo balance</span>
        <span className="coinflip-controls__balance-value">
          <img src={coinIcon} width={13} height={13} alt="" />
          <AnimatedNumber value={props.balance} format={formatPoints} duration={500} />
        </span>
        {props.balance < MIN_BET && !locked && (
          <button type="button" className="coinflip-controls__reset" onClick={props.onResetBalance}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
})
