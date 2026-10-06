import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import coinIcon from '../assets/coin.svg'
import raffleIcon from '../assets/events/raffle-icon.svg'
import EventBanner from '../components/events/EventBanner'
import RaffleMachine from '../components/raffle/RaffleMachine'
import type { RaffleDrawShow } from '../components/raffle/RaffleMachine'
import { socials } from '../data/links'
import { replayDraws } from '../../shared/raffles'
import type { PublicRaffle, RaffleKind } from '../../shared/raffles'
import { signInUrl, useAuth } from '../hooks/useAuth'
import { useGiveaway, useRaffles } from '../hooks/useEvents'
import './ChallengesPage.css'
import './EventsPages.css'
import '../components/events/EventBlocks.css'
import './RafflesPage.css'

type Tab = RaffleKind | 'chat'

const TABS: { id: Tab; label: string }[] = [
  { id: 'wager', label: 'Wager Raffle' },
  { id: 'watch', label: 'Watch-Time Raffle' },
  { id: 'chat', label: 'Chat Giveaways' },
]

const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hours = (minutes: number) => `${Math.floor(minutes / 60).toLocaleString('en-US')}h ${Math.round(minutes % 60)}m`
const pct = (v: number) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: v < 0.01 ? 2 : 1 })}%`
const month = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Monthly raffles (wager and watch time) drawn on the 3D machine, plus Kick chat giveaways */
export default function RafflesPage() {
  const { status, data } = useRaffles()
  const [params, setParams] = useSearchParams()
  const raffles = data?.raffles ?? []
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && TABS.some((t) => t.id === requested) ? requested : 'wager'
  const raffle = tab === 'chat' ? null : raffles.find((r) => r.kind === tab) ?? null

  return (
    <div className="section-page">
      <div className="ev-page raffles">
        <EventBanner top="MONTHLY" main="RAFFLES" />

        <div className="kk-tabs raffles__tabs" role="tablist" aria-label="Raffles">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`kk-tab${tab === t.id ? ' kk-tab--selected' : ''}`}
              onClick={() => setParams(t.id === 'wager' ? {} : { tab: t.id }, { replace: true })}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'chat' ? (
          <ChatGiveaway />
        ) : status === 'loading' ? (
          <div className="ev-loading" aria-label="Loading" />
        ) : raffle ? (
          <RaffleView key={raffle.id} raffle={raffle} />
        ) : (
          <section className="ev-bar">
            <span className="ev-bar__icon" aria-hidden>
              <img src={raffleIcon} width={26} height={26} alt="" />
            </span>
            <span className="ev-bar__text">
              <span className="ev-bar__title">No {tab === 'wager' ? 'wager' : 'watch-time'} raffle this month yet</span>
              <span className="ev-bar__detail">It opens at the start of the month. Check back soon.</span>
            </span>
            <a className="kk-button ev-bar__action" href={socials.kick.url} target="_blank" rel="noopener noreferrer">
              Watch on Kick
            </a>
          </section>
        )}
      </div>
    </div>
  )
}

const STATUS: Record<PublicRaffle['status'], { chip: string; tone: string }> = {
  open: { chip: 'Counting tickets', tone: 'open' },
  locked: { chip: 'Drawing', tone: 'closed' },
  complete: { chip: 'Drawn', tone: 'drawn' },
}

function RaffleView({ raffle }: { raffle: PublicRaffle }) {
  const wager = raffle.kind === 'wager'
  const maxWin = raffle.prizePerDraw * raffle.maxWinsPerPerson
  const remaining = raffle.drawsTotal - raffle.draws.length

  // Balls: everyone who can still win, most tickets first
  const balls = useMemo(() => {
    const wins = new Map<string, number>()
    raffle.draws.forEach((d) => wins.set(d.name, (wins.get(d.name) ?? 0) + 1))
    return [...raffle.entries]
      .filter((e) => (wins.get(e.name) ?? 0) < raffle.maxWinsPerPerson)
      .sort((a, b) => b.tickets - a.tickets)
      .map((e) => e.name)
  }, [raffle.entries, raffle.draws, raffle.maxWinsPerPerson])

  // A draw that arrives while the page is open plays on the machine
  const seen = useRef(raffle.draws.length)
  const [show, setShow] = useState<RaffleDrawShow | null>(null)
  useEffect(() => {
    if (raffle.draws.length > seen.current) {
      const d = raffle.draws[raffle.draws.length - 1]
      setShow({ key: `${raffle.id}-${d.n}`, name: d.name })
    }
    seen.current = raffle.draws.length
  }, [raffle.draws, raffle.id])
  const resting = raffle.draws.length ? raffle.draws[raffle.draws.length - 1].name : null

  const detail =
    raffle.status === 'open'
      ? `Tickets count until ${day(raffle.end - 1)}${raffle.countingFrom ? ` · watch time counted from ${day(raffle.countingFrom)}` : ''}. Draws happen live on stream.`
      : raffle.status === 'locked'
        ? `Tickets are locked. ${remaining} of ${raffle.drawsTotal} draws to go.`
        : 'Every draw has been made. The seed is revealed below, so anyone can check them.'

  return (
    <>
      <section className="ev-bar">
        <span className="ev-bar__icon" aria-hidden>
          <img src={raffleIcon} width={26} height={26} alt="" />
        </span>
        <span className="ev-bar__text">
          <span className="ev-bar__title">
            {raffle.title} · <span className="ev-accent">{month(raffle.start)}</span>
          </span>
          <span className="ev-bar__detail">{detail}</span>
        </span>
        <span className={`ev-chip ev-chip--${STATUS[raffle.status].tone}`}>{STATUS[raffle.status].chip}</span>
      </section>

      <ul className="ev-stats">
        <Stat label="Prize pool" value={usd(raffle.prizePool)} accent />
        <Stat label="Draws" value={`${raffle.drawsTotal} × ${usd(raffle.prizePerDraw)}`} />
        <Stat label="Max per person" value={`${usd(maxWin)} (${raffle.maxWinsPerPerson} wins)`} />
        <Stat label="Tickets" value={`${raffle.totalTickets.toLocaleString('en-US')} · ${raffle.entries.length} players`} />
      </ul>

      <div className="raffles__main">
        <div className="raffles__machine">
          <RaffleMachine names={balls} draw={show} resting={resting} />
        </div>
        <div className="raffles__side">
          <YourTickets raffle={raffle} />
          <section className="ev-card ev-how ev-how--compact">
            <h2 className="ev-card__title">How it works</h2>
            <ol className="ev-how__steps">
              <li className="ev-how__step">
                <span className="ev-how__n">1</span>
                <span>
                  <span className="ev-how__title">{wager ? 'Wager under KINGKULBIK' : 'Watch the stream'}</span>
                  <span className="ev-how__text">
                    {wager
                      ? `Every ${usd(raffle.ticketUnit)} wagered this month is a ticket.`
                      : `Every ${raffle.ticketUnit} minutes watched on Kick this month is a ticket.`}
                  </span>
                </span>
              </li>
              <li className="ev-how__step">
                <span className="ev-how__n">2</span>
                <span>
                  <span className="ev-how__title">More tickets, better odds</span>
                  <span className="ev-how__text">Each draw picks one ticket, so your chance is your share of the tickets.</span>
                </span>
              </li>
              <li className="ev-how__step">
                <span className="ev-how__n">3</span>
                <span>
                  <span className="ev-how__title">Live draws</span>
                  <span className="ev-how__text">
                    {raffle.drawsTotal} draws of {usd(raffle.prizePerDraw)}. Win at most {raffle.maxWinsPerPerson} ({usd(maxWin)}).
                  </span>
                </span>
              </li>
            </ol>
          </section>
        </div>
      </div>

      <h2 className="ev-section raffles__heading">Draws</h2>
      <ol className="raffles__draws">
        {Array.from({ length: raffle.drawsTotal }, (_, n) => {
          const d = raffle.draws[n]
          return (
            <li key={n} className={`raffles__draw${d ? ' raffles__draw--done' : ''}`}>
              <span className="raffles__draw-n">Draw {n + 1}</span>
              <span className="raffles__draw-name">{d ? d.name : 'To be drawn'}</span>
              <span className="raffles__draw-prize">{usd(raffle.prizePerDraw)}</span>
            </li>
          )
        })}
      </ol>

      <Entries raffle={raffle} />
      <Fairness raffle={raffle} />
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <li className="ev-stat">
      <span className="ev-stat__label">{label}</span>
      <span className={`ev-stat__value${accent ? ' ev-accent' : ''}`}>{value}</span>
    </li>
  )
}

/** The signed-in viewer's tickets and odds, or how to get some */
function YourTickets({ raffle }: { raffle: PublicRaffle }) {
  const { status, user } = useAuth()
  const wager = raffle.kind === 'wager'
  if (status === 'loading') return <section className="ev-card raffles__you" aria-busy />

  const linked = wager ? user?.stake : user?.kick
  const mine = raffle.mine

  return (
    <section className="ev-card raffles__you">
      <h2 className="ev-card__title">Your tickets</h2>
      {!user ? (
        <>
          <p className="ev-card__text">Sign in to see your tickets and odds.</p>
          <a className="kk-button raffles__you-action" href={signInUrl('/raffles')}>
            Sign in
          </a>
        </>
      ) : !linked ? (
        <>
          <p className="ev-card__text">
            {wager ? 'Link your Stake username to see your tickets.' : 'Link your Kick account to count your watch time.'}
          </p>
          <Link className="kk-button raffles__you-action" to="/account">
            {wager ? 'Link Stake' : 'Link Kick'}
          </Link>
        </>
      ) : mine ? (
        <>
          <div className="raffles__you-figures">
            <span className="raffles__you-tickets">
              {mine.tickets.toLocaleString('en-US')}
              <small>{mine.tickets === 1 ? 'ticket' : 'tickets'}</small>
            </span>
            <span className="raffles__you-odds">
              {pct(mine.odds)}
              <small>per draw</small>
            </span>
          </div>
          <p className="ev-card__text">
            {wager ? `${money(mine.amount)} wagered` : `${hours(mine.amount)} watched`} this month
            {mine.wins > 0 && (
              <>
                {' '}
                · won <strong>{mine.wins}</strong> {mine.wins === 1 ? 'draw' : 'draws'}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="ev-card__text">
          {wager
            ? `No tickets yet. Wager ${usd(raffle.ticketUnit)} under KINGKULBIK this month for your first.`
            : `No tickets yet. Watch ${raffle.ticketUnit} minutes on Kick this month for your first.`}
        </p>
      )}
    </section>
  )
}

const SHOWN = 50

function Entries({ raffle }: { raffle: PublicRaffle }) {
  const [all, setAll] = useState(false)
  const wager = raffle.kind === 'wager'
  const sorted = [...raffle.entries].sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name))
  const rows = all ? sorted : sorted.slice(0, SHOWN)
  const mine = raffle.mine

  return (
    <section className="raffles__entries" aria-labelledby="raffle-entries">
      <div className="raffles__entries-head">
        <h2 id="raffle-entries" className="ev-section">
          Entries
        </h2>
        <span className="raffles__count">{raffle.totalTickets.toLocaleString('en-US')} tickets</span>
      </div>
      {rows.length === 0 ? (
        <p className="ev-card ev-card__text">
          {raffle.status === 'open' ? 'Tickets show here as they’re earned this month.' : 'No entries.'}
        </p>
      ) : (
        <div className="ev-table raffles__table" role="table" aria-label="Entries">
          <div className="ev-table__row ev-table__row--head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Player</span>
            <span role="columnheader">{wager ? 'Wagered' : 'Watched'}</span>
            <span role="columnheader">Tickets</span>
            <span role="columnheader">Odds</span>
          </div>
          {rows.map((e, i) => {
            const you = mine && mine.tickets === e.tickets && mine.amount === e.amount
            return (
              <div key={e.name + i} role="row" className={`ev-table__row${you ? ' ev-table__row--you' : ''}`}>
                <span role="cell">
                  <span className="ev-table__place">{i + 1}</span>
                </span>
                <span role="cell" className="ev-table__name">
                  {e.name}
                  {you && <span className="ev-table__you">You</span>}
                </span>
                <span role="cell" className="raffles__muted">
                  {wager ? money(e.amount) : hours(e.amount)}
                </span>
                <span role="cell" className="raffles__tickets">
                  <img src={coinIcon} width={12} height={12} alt="" />
                  {e.tickets.toLocaleString('en-US')}
                </span>
                <span role="cell">{pct(e.odds)}</span>
              </div>
            )
          })}
        </div>
      )}
      {sorted.length > SHOWN && (
        <button type="button" className="raffles__button raffles__more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${sorted.length}`}
        </button>
      )}
    </section>
  )
}

/** Seed hash before, seed after, and a browser re-run of every draw */
function Fairness({ raffle }: { raffle: PublicRaffle }) {
  const [check, setCheck] = useState<'idle' | 'ok' | 'bad' | 'running'>('idle')
  const verify = async () => {
    if (!raffle.seed) return
    setCheck('running')
    // Public names are masked (two could look alike), so players are told apart by their place
    // in the frozen list; the tickets, their order and the seed are what decide every draw
    const entries = raffle.entries.map((e, i) => ({ ...e, name: String(i) }))
    const replayed = await replayDraws({ ...raffle, entries }, raffle.seed)
    const ok = replayed.length === raffle.draws.length && replayed.every((d, i) => d.ticket === raffle.draws[i].ticket && d.pool === raffle.draws[i].pool)
    setCheck(ok ? 'ok' : 'bad')
  }

  if (!raffle.seedHash) {
    return (
      <section className="ev-card raffles__fair">
        <h2 className="ev-card__title">Fair draws</h2>
        <p className="ev-card__text">
          When tickets lock, the server commits to a secret seed and shows its fingerprint here. Every draw comes from
          that seed, and it’s revealed after the last draw so anyone can re-run them.
        </p>
      </section>
    )
  }
  return (
    <section className="ev-card raffles__fair">
      <h2 className="ev-card__title">Fair draws</h2>
      <p className="ev-card__text">
        Each draw picks ticket <em>⌊random × tickets in play⌋</em>, with the random number from HMAC-SHA256 of the seed,
        so your odds are exactly your share of the tickets.
      </p>
      <dl className="raffles__seed">
        <div>
          <dt>Seed hash (committed when tickets locked)</dt>
          <dd>{raffle.seedHash}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd>{raffle.seed ?? 'Revealed after the last draw'}</dd>
        </div>
      </dl>
      {raffle.seed && (
        <div className="raffles__verify">
          <button type="button" className="raffles__button" onClick={() => void verify()} disabled={check === 'running'}>
            {check === 'running' ? 'Checking…' : 'Verify every draw'}
          </button>
          {check === 'ok' && <span className="raffles__verify-ok">Every draw matches the seed.</span>}
          {check === 'bad' && <span className="raffles__verify-bad">These draws don’t match the seed.</span>}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Kick chat giveaways

function ChatGiveaway() {
  const { status, data } = useGiveaway()
  const g = data?.giveaway ?? null
  const history = data?.history ?? []

  if (status === 'loading') return <div className="ev-loading" aria-label="Loading" />
  return (
    <>
      {!g ? (
        <section className="ev-bar">
          <span className="ev-bar__icon" aria-hidden>
            <img src={raffleIcon} width={26} height={26} alt="" />
          </span>
          <span className="ev-bar__text">
            <span className="ev-bar__title">No chat giveaway right now</span>
            <span className="ev-bar__detail">They happen during the stream: type the keyword in Kick chat to enter.</span>
          </span>
          <a className="kk-button ev-bar__action" href={socials.kick.url} target="_blank" rel="noopener noreferrer">
            Watch on Kick
          </a>
        </section>
      ) : (
        <section className="events-card events-raffle">
          <div className="events-title events-title--flush">
            <h2 className="events-title__name">{g.prize}</h2>
            <span className={`ev-chip ev-chip--${g.open ? 'open' : 'closed'}`}>{g.open ? 'Entries open' : 'Entries closed'}</span>
          </div>
          <p className="events-raffle__how">
            {g.open ? 'Type' : 'Entry was'} <span className="events-raffle__keyword">{g.keyword}</span> in{' '}
            <a className="events-link" href={socials.kick.url} target="_blank" rel="noopener noreferrer">
              Kick chat
            </a>
            {g.minPoints > 0 && (
              <>
                {' '}
                · needs <img src={coinIcon} width={13} height={13} alt="" /> {g.minPoints.toLocaleString('en-US')} King Points
              </>
            )}
          </p>
          <p className="events-raffle__count">
            <strong>{g.count.toLocaleString('en-US')}</strong> {g.count === 1 ? 'entry' : 'entries'}
          </p>
          {g.winners.length > 0 && (
            <div className="events-raffle__winner">
              <span className="events-final__label">{g.winners.length > 1 ? 'Latest winner' : 'Winner'}</span>
              <span className="events-raffle__winner-name">{g.winners[0].name}</span>
            </div>
          )}
          {g.recent.length > 0 && (
            <ul className="events-names" aria-label="Latest entries">
              {g.recent.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {history.length > 0 && (
        <>
          <h2 className="ev-section raffles__heading">Recent winners</h2>
          <ul className="events-standings">
            {history.map((w, i) => (
              <li key={w.at + w.name} className="events-standing">
                <span className="events-standing__place">{i + 1}</span>
                <span className="events-standing__name">{w.name}</span>
                <span className="events-standing__value">{w.prize}</span>
                <span className="events-standing__off">{day(w.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
