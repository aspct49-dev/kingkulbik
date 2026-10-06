import coinIcon from '../../assets/coin.svg'
import LiveBets from '../../components/LiveBets'
import { formatPoints } from '../../components/keno/format'
import { refreshLiveBets, useLiveBets } from '../../hooks/useLiveBets'
import { adminPost } from './api'
import { ConfirmButton } from './ui'

/** The live feed with totals over the bets it holds, and a way to clear it */
export default function BetsAdmin({ notify }: { notify: (message: string) => void }) {
  const bets = useLiveBets() ?? []
  const wagered = bets.reduce((sum, b) => sum + b.bet, 0)
  const paid = bets.reduce((sum, b) => sum + b.payout, 0)
  const biggest = bets.reduce((max, b) => Math.max(max, b.payout), 0)

  const clear = async () => {
    try {
      await adminPost('feed/clear')
      refreshLiveBets()
      notify('Feed cleared')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not clear the feed.')
    }
  }

  return (
    <div className="admin-stack">
      <ul className="admin-stats">
        <Stat label={`Bets in the feed`} value={String(bets.length)} />
        <Stat label="Wagered" value={formatPoints(wagered)} coin />
        <Stat label="Paid out" value={formatPoints(paid)} coin />
        <Stat
          label="House result"
          value={`${wagered - paid >= 0 ? '+' : '−'}${formatPoints(Math.abs(wagered - paid))}`}
          coin
          tone={wagered - paid >= 0 ? 'up' : 'down'}
        />
        <Stat label="Biggest payout" value={formatPoints(biggest)} coin />
      </ul>

      <div className="admin-card admin-card--flush">
        <LiveBets />
        <div className="admin-actions admin-actions--split">
          <p className="admin-note">The feed keeps the latest 40 bets from every player. Guests show as “Guest”.</p>
          <ConfirmButton label="Clear feed" confirm="Clear every bet?" onConfirm={() => void clear()} />
        </div>
      </div>
    </div>
  )
}

export function Stat({ label, value, coin, tone }: { label: string; value: string; coin?: boolean; tone?: 'up' | 'down' }) {
  return (
    <li className="admin-stat">
      <span className="admin-stat__label">{label}</span>
      <span className={`admin-stat__value${tone ? ` admin-stat__value--${tone}` : ''}`}>
        {coin && <img src={coinIcon} width={14} height={14} alt="" />}
        {value}
      </span>
    </li>
  )
}
