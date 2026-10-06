import { memo } from 'react'
import coinIcon from '../../assets/coin.svg'
import caretIcon from '../../assets/keno/caret.svg'
import { RISKS } from '../../games/keno/engine'
import type { Risk } from '../../games/keno/engine'
import AnimatedNumber from '../AnimatedNumber'
import { formatKingPoints } from '../../games/originals'
import type { PlayGate } from '../../games/originals'
import '../BetPanel.css'

type KenoControlsProps = {
  betInput: string
  onBetInputChange: (value: string) => void
  onBetBlur: () => void
  onHalve: () => void
  onDouble: () => void
  risk: Risk
  onRiskChange: (risk: Risk) => void
  onRandomPick: () => void
  onClear: () => void
  onBet: () => void
  canBet: boolean
  /** Controls locked (drawing, or Random Pick placing tiles) */
  busy: boolean
  drawing: boolean
  error: string | null
  balance: number
  /** Signed out or no Kick: a link in place of the Bet button */
  gate: PlayGate
}

export default memo(function KenoControls(props: KenoControlsProps) {
  const { busy } = props

  return (
    <div className="bet-panel">
      <label className="bet-panel__label" htmlFor="keno-bet">
        Bet Amount
      </label>
      <div className="bet-field">
        <img src={coinIcon} width={14} height={14} alt="" />
        <input
          id="keno-bet"
          inputMode="numeric"
          autoComplete="off"
          value={props.betInput}
          disabled={busy}
          onChange={(e) => props.onBetInputChange(e.target.value)}
          onBlur={props.onBetBlur}
        />
        <div className="bet-field__actions">
          <button type="button" onClick={props.onHalve} disabled={busy} aria-label="Halve bet">
            ½
          </button>
          <span className="bet-field__divider" aria-hidden />
          <button type="button" onClick={props.onDouble} disabled={busy} aria-label="Double bet">
            2x
          </button>
        </div>
      </div>

      {props.gate ? (
        <a className="bet-panel__bet" href={props.gate.href}>
          {props.gate.label}
        </a>
      ) : (
        <button type="button" className="bet-panel__bet" onClick={props.onBet} disabled={!props.canBet}>
          {props.drawing ? 'Drawing…' : 'Bet'}
        </button>
      )}

      <button type="button" className="bet-panel__secondary" onClick={props.onRandomPick} disabled={busy}>
        Random Pick
      </button>
      <button type="button" className="bet-panel__secondary" onClick={props.onClear} disabled={busy}>
        Clear Table
      </button>

      <label className="bet-panel__label bet-panel__label--spaced" htmlFor="keno-risk">
        Difficulty
      </label>
      <div className="bet-select">
        <select
          id="keno-risk"
          value={props.risk}
          disabled={busy}
          onChange={(e) => props.onRiskChange(e.target.value as Risk)}
        >
          {RISKS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <img className="bet-select__caret" src={caretIcon} width={9.03791} height={5.45621} alt="" />
      </div>
      {props.error && (
        <p className="bet-panel__error" role="alert">
          {props.error}
        </p>
      )}

      <div className="bet-panel__balance">
        <span>King Points</span>
        <span className="bet-panel__balance-value">
          <img src={coinIcon} width={13} height={13} alt="" />
          <AnimatedNumber value={props.balance} format={formatKingPoints} duration={500} />
        </span>
      </div>
    </div>
  )
})
