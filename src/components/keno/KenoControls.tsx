import { memo } from 'react'
import coinIcon from '../../assets/keno/coin.png'
import caretIcon from '../../assets/keno/caret.svg'
import dividerLine from '../../assets/keno/divider.svg'
import { RISKS } from '../../games/keno/engine'
import type { Risk } from '../../games/keno/engine'
import { formatPoints } from './format'
import './KenoControls.css'

export const MIN_BET = 1

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
  onResetBalance: () => void
}

export default memo(function KenoControls(props: KenoControlsProps) {
  const { busy } = props

  return (
    <div className="keno-controls">
      <div className="keno-controls__label-row">
        <label htmlFor="keno-bet">Bet Amount</label>
        <span>Min. bet: {MIN_BET} point</span>
      </div>
      <div className="keno-bet">
        <div className="keno-bet__field">
          <img src={coinIcon} width={13} height={13} alt="" />
          <input
            id="keno-bet"
            inputMode="decimal"
            autoComplete="off"
            value={props.betInput}
            disabled={busy}
            onChange={(e) => props.onBetInputChange(e.target.value)}
            onBlur={props.onBetBlur}
          />
        </div>
        <button type="button" className="keno-bet__half" onClick={props.onHalve} disabled={busy} aria-label="Halve bet">
          ½
        </button>
        <span className="keno-bet__divider" aria-hidden>
          <img src={dividerLine} width={22} height={1} alt="" />
        </span>
        <button type="button" className="keno-bet__double" onClick={props.onDouble} disabled={busy} aria-label="Double bet">
          2x
        </button>
      </div>

      <label className="keno-controls__label" htmlFor="keno-risk">
        Difficulty
      </label>
      <div className="keno-select">
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
        <img className="keno-select__caret" src={caretIcon} width={9.03791} height={5.45621} alt="" />
      </div>

      <button type="button" className="keno-controls__secondary" onClick={props.onRandomPick} disabled={busy}>
        Random Pick
      </button>
      <button type="button" className="keno-controls__secondary" onClick={props.onClear} disabled={busy}>
        Clear Table
      </button>
      <button type="button" className="keno-controls__bet" onClick={props.onBet} disabled={!props.canBet}>
        {props.drawing ? 'Drawing…' : 'Bet'}
      </button>
      {props.error && (
        <p className="keno-controls__error" role="alert">
          {props.error}
        </p>
      )}

      <div className="keno-controls__balance">
        <span>Demo balance</span>
        <span className="keno-controls__balance-value">
          <img src={coinIcon} width={13} height={13} alt="" />
          {formatPoints(props.balance)}
        </span>
        {props.balance < MIN_BET && (
          <button type="button" className="keno-controls__reset" onClick={props.onResetBalance}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
})
