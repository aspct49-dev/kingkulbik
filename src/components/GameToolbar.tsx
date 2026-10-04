import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import settingsIcon from '../assets/keno/settings.svg'
import statsIcon from '../assets/keno/live-stats.svg'
import shieldIcon from '../assets/keno/fairness-shield.svg'
import { formatPoints } from './keno/format'
import ProfitChart from './ProfitChart'
import './GameToolbar.css'

export type SessionStats = {
  bets: number
  wagered: number
  profit: number
  wins: number
  losses: number
  /** Cumulative profit after each bet, starting at 0 */
  history: number[]
}

export const EMPTY_STATS: SessionStats = { bets: 0, wagered: 0, profit: 0, wins: 0, losses: 0, history: [0] }

const HISTORY_LIMIT = 300

/** Fold one settled bet into the session stats */
export function recordBet(s: SessionStats, wagered: number, payout: number): SessionStats {
  const profit = Math.round((s.profit + payout - wagered) * 100) / 100
  const won = payout > wagered
  return {
    bets: s.bets + 1,
    wagered: s.wagered + wagered,
    profit,
    wins: s.wins + (won ? 1 : 0),
    losses: s.losses + (won ? 0 : 1),
    history: [...s.history, profit].slice(-HISTORY_LIMIT),
  }
}

type GameToolbarProps = {
  sound: boolean
  onSoundChange: (sound: boolean) => void
  instant: boolean
  onInstantChange: (instant: boolean) => void
  /** e.g. "Instant draws" / "Instant flips" */
  instantLabel: string
  instantHint: string
  theater: boolean
  onTheaterChange: (theater: boolean) => void
  stats: SessionStats
  onResetStats: () => void
  /** Body of the Fairness dialog (game rules, odds) */
  fairness: ReactNode
}

type Menu = 'settings' | 'stats' | null

/**
 * The bar under each game: settings (sound, instant mode), theatre mode, live
 * stats with the session profit graph, the site logo, and the Fairness dialog.
 */
export default memo(function GameToolbar(props: GameToolbarProps) {
  const { stats } = props
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

  return (
    <div className="game-toolbar" ref={toolbarRef}>
      <div className="game-toolbar__group">
        <button
          type="button"
          className="game-toolbar__icon"
          aria-label="Settings"
          aria-expanded={menu === 'settings'}
          onClick={() => toggle('settings')}
        >
          <img src={settingsIcon} width={21} height={21} alt="" />
        </button>
        <button
          type="button"
          className={`game-toolbar__icon${props.theater ? ' game-toolbar__icon--active' : ''}`}
          aria-label="Theatre mode"
          aria-pressed={props.theater}
          onClick={() => props.onTheaterChange(!props.theater)}
        >
          <span className="game-toolbar__theater" />
        </button>
        <button
          type="button"
          className="game-toolbar__icon"
          aria-label="Live statistics"
          aria-expanded={menu === 'stats'}
          onClick={() => toggle('stats')}
        >
          <img src={statsIcon} width={24} height={24} alt="" />
        </button>

        {menu === 'settings' && (
          <div className="game-popover" role="dialog" aria-label="Settings">
            <label className="game-popover__toggle">
              <input type="checkbox" checked={props.sound} onChange={(e) => props.onSoundChange(e.target.checked)} />
              <span className="game-popover__switch" aria-hidden />
              Sound
            </label>
            <label className="game-popover__toggle game-popover__toggle--spaced">
              <input
                type="checkbox"
                checked={props.instant}
                onChange={(e) => props.onInstantChange(e.target.checked)}
              />
              <span className="game-popover__switch" aria-hidden />
              {props.instantLabel}
            </label>
            <p className="game-popover__hint">{props.instantHint}</p>
          </div>
        )}

        {menu === 'stats' && (
          <div className="game-popover game-popover--stats" role="dialog" aria-label="Live statistics">
            <div className="game-popover__header">
              <p className="game-popover__title">This session</p>
              {stats.bets > 0 && (
                <button type="button" className="game-popover__reset" onClick={props.onResetStats}>
                  Reset
                </button>
              )}
            </div>
            <ProfitChart history={stats.history} />
            <dl className="game-popover__stats">
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

      <span className="game-toolbar__logo" aria-hidden>
        KING KULBIK
      </span>

      <button type="button" className="game-toolbar__fairness" onClick={() => dialogRef.current?.showModal()}>
        <img src={shieldIcon} width={18} height={18} alt="" />
        Fairness
      </button>

      <dialog
        ref={dialogRef}
        className="game-fairness"
        aria-label="Fairness"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="game-fairness__body">
          {props.fairness}
          <form method="dialog">
            <button className="game-fairness__close">Close</button>
          </form>
        </div>
      </dialog>
    </div>
  )
})
