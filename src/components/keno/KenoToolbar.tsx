import { useEffect, useRef, useState } from 'react'
import settingsIcon from '../../assets/keno/settings.svg'
import statsIcon from '../../assets/keno/live-stats.svg'
import shieldIcon from '../../assets/keno/fairness-shield.svg'
import { DRAW_COUNT, MAX_PICKS, RISKS, TILE_COUNT, getPayouts, getReturnToPlayer } from '../../games/keno/engine'
import type { Risk } from '../../games/keno/engine'
import { formatMultiplier, formatPoints } from './format'
import KenoProfitChart from './KenoProfitChart'
import './KenoToolbar.css'

export type SessionStats = {
  bets: number
  wagered: number
  profit: number
  wins: number
  losses: number
  /** Cumulative profit after each bet, starting at 0 */
  history: number[]
}

type KenoToolbarProps = {
  instant: boolean
  onInstantChange: (instant: boolean) => void
  sound: boolean
  onSoundChange: (sound: boolean) => void
  theater: boolean
  onTheaterChange: (theater: boolean) => void
  stats: SessionStats
  onResetStats: () => void
  risk: Risk
}

type Menu = 'settings' | 'stats' | null

export default function KenoToolbar(props: KenoToolbarProps) {
  const { instant, onInstantChange, sound, onSoundChange, theater, onTheaterChange, stats, onResetStats, risk } = props
  const [menu, setMenu] = useState<Menu>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!menu) return
    const onPointer = (e: PointerEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const toggle = (next: Menu) => setMenu((current) => (current === next ? null : next))
  const riskLabel = RISKS.find((r) => r.id === risk)?.label

  return (
    <div className="keno-toolbar" ref={toolbarRef}>
      <div className="keno-toolbar__group">
        <button
          type="button"
          className="keno-toolbar__icon"
          aria-label="Settings"
          aria-expanded={menu === 'settings'}
          onClick={() => toggle('settings')}
        >
          <img src={settingsIcon} width={21} height={21} alt="" />
        </button>
        <button
          type="button"
          className={`keno-toolbar__icon${theater ? ' keno-toolbar__icon--active' : ''}`}
          aria-label="Theater mode"
          aria-pressed={theater}
          onClick={() => onTheaterChange(!theater)}
        >
          <span className="keno-toolbar__theater" />
        </button>
        <button
          type="button"
          className="keno-toolbar__icon"
          aria-label="Live statistics"
          aria-expanded={menu === 'stats'}
          onClick={() => toggle('stats')}
        >
          <img src={statsIcon} width={24} height={24} alt="" />
        </button>

        {menu === 'settings' && (
          <div className="keno-popover" role="dialog" aria-label="Settings">
            <label className="keno-popover__toggle">
              <input type="checkbox" checked={sound} onChange={(e) => onSoundChange(e.target.checked)} />
              <span className="keno-popover__switch" aria-hidden />
              Sound
            </label>
            <label className="keno-popover__toggle keno-popover__toggle--spaced">
              <input type="checkbox" checked={instant} onChange={(e) => onInstantChange(e.target.checked)} />
              <span className="keno-popover__switch" aria-hidden />
              Instant draws
            </label>
            <p className="keno-popover__hint">Show all {DRAW_COUNT} drawn tiles at once instead of one by one.</p>
          </div>
        )}

        {menu === 'stats' && (
          <div className="keno-popover keno-popover--stats" role="dialog" aria-label="Live statistics">
            <div className="keno-popover__header">
              <p className="keno-popover__title">This session</p>
              {stats.bets > 0 && (
                <button type="button" className="keno-popover__reset" onClick={onResetStats}>
                  Reset
                </button>
              )}
            </div>
            <KenoProfitChart history={stats.history} />
            <dl className="keno-popover__stats">
              <dt>Profit</dt>
              <dd className={stats.profit >= 0 ? 'is-up' : 'is-down'}>
                {stats.profit >= 0 ? '+' : '−'}
                {formatPoints(Math.abs(stats.profit))}
              </dd>
              <dt>Wagered</dt>
              <dd>{formatPoints(stats.wagered)}</dd>
              <dt>Bets</dt>
              <dd>{stats.bets}</dd>
              <dt>Wins</dt>
              <dd className="is-up">{stats.wins}</dd>
              <dt>Losses</dt>
              <dd className="is-down">{stats.losses}</dd>
            </dl>
          </div>
        )}
      </div>

      <button type="button" className="keno-toolbar__fairness" onClick={() => dialogRef.current?.showModal()}>
        <img src={shieldIcon} width={18} height={18} alt="" />
        Fairness
      </button>

      <dialog
        ref={dialogRef}
        className="keno-fairness"
        aria-labelledby="keno-fairness-title"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="keno-fairness__body">
          <h2 id="keno-fairness-title">Fairness</h2>
          <p>
            Pick 1–{MAX_PICKS} of the {TILE_COUNT} tiles, then {DRAW_COUNT} tiles are drawn. Every tile is equally
            likely to be drawn; your payout is your bet times the multiplier for how many of your picks were hit.
          </p>
          <p>
            <strong>Demo mode:</strong> the draw happens in your browser using its cryptographic random number
            generator, and the points are a demo balance stored only on this device.
          </p>
          <h3>{riskLabel} payouts</h3>
          <div className="keno-fairness__table-wrap">
            <table className="keno-fairness__table">
              <thead>
                <tr>
                  <th scope="col">Picks</th>
                  <th scope="col">Multiplier by hits (0, 1, 2 …)</th>
                  <th scope="col">Return</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((picks) => (
                  <tr key={picks}>
                    <th scope="row">{picks}</th>
                    <td>{getPayouts(risk, picks).map(formatMultiplier).join(' · ')}</td>
                    <td>{(getReturnToPlayer(risk, picks) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form method="dialog">
            <button className="keno-fairness__close">Close</button>
          </form>
        </div>
      </dialog>
    </div>
  )
}
