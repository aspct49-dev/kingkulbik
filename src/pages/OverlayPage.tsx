import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import Bracket from '../components/events/Bracket'
import RaffleMachine from '../components/raffle/RaffleMachine'
import type { RaffleDrawShow } from '../components/raffle/RaffleMachine'
import { bonusMultiplier, huntStats } from '../../shared/events'
import type { Hunt, PublicGiveaway } from '../../shared/events'
import { useGiveaway, useGuessRound, useHunt, useRaffles, useTournaments } from '../hooks/useEvents'
import './OverlayPage.css'

/*
 * Stream overlays for OBS (Browser Source): transparent pages that poll the
 * public event data. No header, sidebar or footer.
 */

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const x = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}×`)
const POLL = 3000

export default function OverlayPage() {
  const { kind } = useParams()

  // Transparent page for OBS
  useLayoutEffect(() => {
    document.documentElement.classList.add('is-overlay')
    return () => document.documentElement.classList.remove('is-overlay')
  }, [])

  if (kind === 'hunt') return <HuntOverlay />
  if (kind === 'tournament') return <TournamentOverlay />
  if (kind === 'giveaway') return <GiveawayOverlay />
  if (kind === 'guess') return <GuessOverlay />
  if (kind === 'raffle') return <RaffleOverlay />
  return <p className="ov-panel ov-empty">Unknown overlay. Use /overlay/hunt, tournament, giveaway, guess or raffle.</p>
}

function Brand() {
  return (
    <span className="ov-brand">
      KING <span className="ov-brand__gold">KULBIK</span>
    </span>
  )
}

// ---------------------------------------------------------------- bonus hunt

function HuntOverlay() {
  const hunt = useHunt(POLL).data?.hunt ?? null
  if (!hunt) return null
  return <HuntPanel hunt={hunt} />
}

function HuntPanel({ hunt }: { hunt: Hunt }) {
  const s = huntStats(hunt)
  // Show the bonuses around the next one to open
  const next = hunt.bonuses.findIndex((b) => b.payout === null)
  const from = Math.max(0, Math.min((next < 0 ? hunt.bonuses.length : next) - 3, hunt.bonuses.length - 10))
  const shown = hunt.bonuses.slice(from, from + 10)

  return (
    <section className="ov-panel ov-hunt">
      <header className="ov-head">
        <span className="ov-head__title">Bonus Hunt</span>
        {hunt.number ? <span className="ov-hunt__number">#{hunt.number}</span> : <Brand />}
      </header>
      <dl className="ov-hunt__stats">
        <HuntFigure label="Start" value={usd(hunt.startBalance)} />
        <HuntFigure label="Winnings" value={usd(s.totalWon)} />
        <HuntFigure label="Total bonuses" value={String(s.count)} />
        <HuntFigure label="Remaining" value={String(s.remaining)} />
        <HuntFigure label="Run average" value={x(s.average)} />
        <HuntFigure label="Req average" value={x(s.liveBreakEven ?? s.breakEven)} />
      </dl>
      <div className="ov-hunt__wins">
        <WinCard label="Best win" bonus={s.bestWin} value={s.bestWin ? `${usd(s.bestWin.payout ?? 0)} (${usd(s.bestWin.bet)})` : null} />
        <WinCard
          label="Lucky win"
          bonus={s.luckyWin}
          value={s.luckyWin ? `${x(bonusMultiplier(s.luckyWin))} (${usd(s.luckyWin.payout ?? 0)})` : null}
        />
      </div>
      {shown.length > 0 && (
        <ol className="ov-list" start={from + 1}>
          <li className="ov-list__row ov-list__row--head" aria-hidden>
            <span className="ov-list__n">#</span>
            <span />
            <span className="ov-list__game">Game</span>
            <span className="ov-list__bet">Bet size</span>
            <span className="ov-list__multi">Payout</span>
          </li>
          {shown.map((b, i) => {
            const m = bonusMultiplier(b)
            const current = from + i === next
            return (
              <li key={b.id} className={`ov-list__row${current ? ' ov-list__row--current' : ''}${s.luckyWin?.id === b.id ? ' ov-list__row--best' : ''}`}>
                <span className="ov-list__n">{from + i + 1}</span>
                {b.image ? <img src={b.image.replace('w=300', 'w=80')} width={21} height={28} alt="" /> : <span className="ov-list__art" />}
                <span className="ov-list__game ov-list__game--badged">
                  <span className="ov-list__name">{b.game}</span>
                  {b.badge && <span className="ov-hunt__badge">{b.badge}</span>}
                </span>
                <span className="ov-list__bet">{usd(b.bet)}</span>
                <span className={`ov-list__multi${m !== null && m >= 100 ? ' ov-gold' : ''}`}>{b.payout === null ? '' : usd(b.payout)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function HuntFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="ov-hunt__figure">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Best win (biggest payout) and lucky win (biggest multiplier) */
function WinCard({ label, bonus, value }: { label: string; bonus: Hunt['bonuses'][number] | null; value: string | null }) {
  return (
    <div className="ov-hunt__win">
      {bonus?.image ? <img src={bonus.image.replace('w=300', 'w=120')} width={42} height={56} alt="" /> : <span className="ov-hunt__win-art" />}
      <span className="ov-hunt__win-text">
        <span className="ov-hunt__win-label">★ {label}</span>
        <span className="ov-hunt__win-game">{bonus?.game ?? '—'}</span>
        <span className="ov-hunt__win-value">{value ?? '—'}</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- tournament

function TournamentOverlay() {
  const list = useTournaments(POLL).data?.tournaments ?? []
  const t = list.find((x) => x.status === 'live') ?? list[0]
  if (!t) return null
  return (
    <section className="ov-panel ov-tournament">
      <header className="ov-head">
        <span className="ov-head__title">
          {t.name}
          {t.prize && <span className="ov-head__prize"> · {t.prize}</span>}
        </span>
        <Brand />
      </header>
      <Bracket matches={t.matches} />
    </section>
  )
}

// ---------------------------------------------------------------- guess the balance

function GuessOverlay() {
  const round = useGuessRound(POLL).data?.round ?? null
  if (!round) return null
  const winner = round.standings[0]
  return (
    <section className="ov-panel ov-guess">
      <header className="ov-head">
        <span className="ov-head__title">Guess the Balance</span>
        <Brand />
      </header>
      <p className="ov-guess__name">{round.name}</p>
      {round.status === 'drawn' && round.finalBalance !== null ? (
        <>
          <p className="ov-big">{usd(round.finalBalance)}</p>
          <p className="ov-sub">{winner ? <>Winner <strong>{winner.name}</strong> · {usd(winner.value)}</> : 'No guesses'}</p>
        </>
      ) : (
        <>
          <p className="ov-big">{round.count.toLocaleString('en-US')}</p>
          <p className="ov-sub">
            {round.count === 1 ? 'guess' : 'guesses'} · {round.status === 'open' ? `guess at ${window.location.host}` : 'entries closed'}
            {round.prize && <> · prize {round.prize}</>}
          </p>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- giveaway

const ROW = 56

function GiveawayOverlay() {
  const g = useGiveaway(POLL).data?.giveaway ?? null
  if (!g) return null
  return <GiveawayPanel g={g} />
}

function GiveawayPanel({ g }: { g: NonNullable<PublicGiveaway> }) {
  const latest = g.winners[0]
  const drawKey = latest ? `${latest.name}-${latest.drawnAt}` : null
  const [spin, setSpin] = useState<{ key: string; settled: boolean } | null>(null)
  const firstKey = useRef(drawKey)
  const reelRef = useRef<HTMLDivElement>(null)

  // A new draw spins the reel (a draw that happened before the overlay loaded just shows)
  useEffect(() => {
    if (!drawKey || drawKey === firstKey.current) return
    firstKey.current = drawKey
    setSpin({ key: drawKey, settled: false })
    const id = window.setTimeout(() => setSpin({ key: drawKey, settled: true }), 5200)
    return () => window.clearTimeout(id)
  }, [drawKey])

  // Start at the top, then glide to the winner on the next frame
  useLayoutEffect(() => {
    const reel = reelRef.current
    if (!reel || !spin || spin.settled) return
    reel.style.transition = 'none'
    reel.style.transform = 'translateY(0)'
    void reel.offsetHeight
    reel.style.transition = 'transform 4.8s cubic-bezier(0.12, 0.7, 0.08, 1)'
    reel.style.transform = `translateY(${-(g.reel.length - 1) * ROW}px)`
  }, [spin, g.reel.length])

  const spinning = spin && !spin.settled

  return (
    <section className="ov-panel ov-giveaway">
      <header className="ov-head">
        <span className="ov-head__title">Giveaway · {g.prize}</span>
        <Brand />
      </header>
      {spinning ? (
        <div className="ov-reel" aria-hidden>
          <div className="ov-reel__track" ref={reelRef}>
            {g.reel.map((name, i) => (
              <span className="ov-reel__name" key={i}>
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : latest ? (
        <div className="ov-winner" key={drawKey ?? ''}>
          <span className="ov-winner__label">Winner</span>
          <span className="ov-winner__name">{latest.name}</span>
        </div>
      ) : (
        <div className="ov-join">
          {g.open ? (
            <>
              Type <span className="ov-join__keyword">{g.keyword}</span> in chat
            </>
          ) : (
            'Entries closed'
          )}
        </div>
      )}
      <footer className="ov-foot">
        <strong>{g.count.toLocaleString('en-US')}</strong> {g.count === 1 ? 'entry' : 'entries'}
        {g.minPoints > 0 && <> · {g.minPoints.toLocaleString('en-US')}+ King Points</>}
      </footer>
    </section>
  )
}

// ---------------------------------------------------------------- raffle machine

function RaffleOverlay() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'watch' ? 'watch' : 'wager'
  const raffle = useRaffles(POLL).data?.raffles.find((r) => r.kind === kind) ?? null

  // Draws made while the overlay is up play on the machine
  const seen = useRef<number | null>(null)
  const [show, setShow] = useState<RaffleDrawShow | null>(null)
  const count = raffle?.draws.length ?? 0
  useEffect(() => {
    if (!raffle) return
    if (seen.current !== null && count > seen.current) {
      const d = raffle.draws[count - 1]
      setShow({ key: `${raffle.id}-${d.n}`, name: d.name })
    }
    seen.current = count
  }, [count, raffle])

  if (!raffle) return null
  const wins = new Map<string, number>()
  raffle.draws.forEach((d) => wins.set(d.name, (wins.get(d.name) ?? 0) + 1))
  const balls = [...raffle.entries]
    .filter((e) => (wins.get(e.name) ?? 0) < raffle.maxWinsPerPerson)
    .sort((a, b) => b.tickets - a.tickets)
    .map((e) => e.name)

  return (
    <section className="ov-panel ov-raffle">
      <header className="ov-head">
        <span className="ov-head__title">
          {raffle.title}
          <span className="ov-head__prize"> · ${raffle.prizePool.toLocaleString('en-US')}</span>
        </span>
        <Brand />
      </header>
      <RaffleMachine names={balls} draw={show} resting={show ? null : raffle.draws[count - 1]?.name ?? null} tight />
      <footer className="ov-foot">
        Draw <strong>{Math.min(count + (raffle.status === 'complete' ? 0 : 1), raffle.drawsTotal)}</strong> of {raffle.drawsTotal} ·{' '}
        <strong>{raffle.totalTickets.toLocaleString('en-US')}</strong> tickets · {raffle.entries.length} players
      </footer>
    </section>
  )
}
