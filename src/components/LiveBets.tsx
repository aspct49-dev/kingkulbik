import { memo, useEffect, useMemo, useRef, useState } from 'react'
import coinIcon from '../assets/coin.svg'
import gemIcon from '../assets/keno/gem.svg'
import type { FeedBet, GameId } from '../../shared/originals'
import { useLiveBets } from '../hooks/useLiveBets'
import { formatMultiplier } from '../games/coinflip/engine'
import { formatPoints } from './keno/format'
import './LiveBets.css'

type Filter = 'all' | 'big'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All Bets' },
  { id: 'big', label: 'Big Wins' },
]

/** A "big win" pays at least this multiple */
const BIG_WIN = 5
const SHOWN = 10

const GAMES: Record<GameId, { name: string; icon: string }> = {
  keno: { name: 'Keno', icon: gemIcon },
  coinflip: { name: 'Coinflip', icon: coinIcon },
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Every player's settled originals, newest first, like Stake's bet feed */
export default memo(function LiveBets({ wide }: { wide?: boolean }) {
  const bets = useLiveBets()
  const [filter, setFilter] = useState<Filter>('all')

  const rows = useMemo(() => {
    const list = bets ?? []
    return (filter === 'big' ? list.filter((b) => b.multiplier >= BIG_WIN) : list).slice(0, SHOWN)
  }, [bets, filter])

  // Rows that arrive after the first load slide in; the first batch doesn't
  const seen = useRef<Set<string> | null>(null)
  const fresh = useRef(new Set<string>())
  if (bets) {
    if (!seen.current) seen.current = new Set(bets.map((b) => b.id))
    for (const b of bets) {
      if (!seen.current.has(b.id)) {
        seen.current.add(b.id)
        fresh.current.add(b.id)
      }
    }
  }
  useEffect(() => {
    const id = window.setTimeout(() => fresh.current.clear(), 600)
    return () => window.clearTimeout(id)
  }, [bets])

  return (
    <section className={`live-bets${wide ? ' live-bets--wide' : ''}`} aria-labelledby="live-bets-title">
      <div className="live-bets__head">
        <h2 id="live-bets-title" className="live-bets__title">
          <span className="live-bets__dot" aria-hidden />
          Live Bets
        </h2>
        <div className="kk-tabs live-bets__filter" role="radiogroup" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              className={`kk-tab${filter === f.id ? ' kk-tab--selected' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="live-bets__table" role="table" aria-label="Recent bets" aria-busy={!bets}>
        <div className="live-bets__row live-bets__row--head" role="row">
          <span role="columnheader">Game</span>
          <span role="columnheader" className="live-bets__col-player">
            Player
          </span>
          <span role="columnheader" className="live-bets__col-time">
            Time
          </span>
          <span role="columnheader" className="live-bets__col-bet">
            Bet Amount
          </span>
          <span role="columnheader">Multiplier</span>
          <span role="columnheader">Payout</span>
        </div>

        {rows.map((bet) => (
          <BetRow key={bet.id} bet={bet} fresh={fresh.current.has(bet.id)} />
        ))}

        {bets && rows.length === 0 && (
          <p className="live-bets__empty">
            {filter === 'big' ? `No wins of ${BIG_WIN}× or more yet.` : 'No bets yet. Be the first!'}
          </p>
        )}
        {!bets && <p className="live-bets__empty">Loading bets…</p>}
      </div>
    </section>
  )
})

function BetRow({ bet, fresh }: { bet: FeedBet; fresh: boolean }) {
  const game = GAMES[bet.game]
  const won = bet.payout > 0
  return (
    <div className={`live-bets__row${fresh ? ' live-bets__row--fresh' : ''}`} role="row">
      <span role="cell" className="live-bets__game">
        <img src={game.icon} width={14} height={14} alt="" />
        {game.name}
      </span>
      <span role="cell" className={`live-bets__col-player live-bets__player${bet.player === 'Guest' ? ' live-bets__player--guest' : ''}`}>
        {bet.player}
      </span>
      <span role="cell" className="live-bets__col-time live-bets__muted">
        {time(bet.at)}
      </span>
      <span role="cell" className="live-bets__col-bet live-bets__amount">
        {formatPoints(bet.bet)}
        <img src={coinIcon} width={12} height={12} alt="" />
      </span>
      <span role="cell" className="live-bets__muted">
        {formatMultiplier(bet.multiplier)}×
      </span>
      <span role="cell" className={`live-bets__amount${won ? ' live-bets__amount--win' : ' live-bets__amount--loss'}`}>
        {won ? formatPoints(bet.payout) : `-${formatPoints(bet.bet)}`}
        <img src={coinIcon} width={12} height={12} alt="" />
      </span>
    </div>
  )
}
