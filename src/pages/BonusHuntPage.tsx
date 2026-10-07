import huntIcon from '../assets/events/hunt-icon.svg'
import PageHeading from '../components/PageHeading'
import EventsEmpty from '../components/events/EventsEmpty'
import { bonusMultiplier, huntStats } from '../../shared/events'
import type { Hunt } from '../../shared/events'
import { useHunt } from '../hooks/useEvents'
import './ChallengesPage.css'
import './EventsPages.css'

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const x = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`)

const STAGE = { collecting: 'Collecting bonuses', opening: 'Opening now', finished: 'Finished' } as const

/** The current bonus hunt, live from the stream */
export default function BonusHuntPage() {
  const { status, data } = useHunt()
  const hunt = data?.hunt ?? null

  return (
    <div className="section-page">
      <div className="events">
        <PageHeading icon={huntIcon} gold="BONUS" rest="HUNT">
          Follow every bonus from the stream as it's <span className="page-heading__accent">OPENED</span>, with live
          totals.
        </PageHeading>

        {status === 'loading' ? (
          <div className="events-loading" aria-label="Loading" />
        ) : !hunt ? (
          <EventsEmpty
            icon={huntIcon}
            title="No hunt running"
            text="Hunts are run live on stream. Catch the next one on Kick and follow it here as each bonus opens."
          />
        ) : (
          <HuntView hunt={hunt} />
        )}
      </div>
    </div>
  )
}

function HuntView({ hunt }: { hunt: Hunt }) {
  const s = huntStats(hunt)
  return (
    <>
      <div className="events-title">
        <h2 className="events-title__name">
          {hunt.number && <span className="events-accent">#{hunt.number} </span>}
          {hunt.name}
          {hunt.casino && <span className="events-muted"> · {hunt.casino}</span>}
        </h2>
        <span className={`events-chip events-chip--${hunt.status}`}>{STAGE[hunt.status]}</span>
      </div>

      <ul className="events-stats">
        <Stat label="Start cost" value={usd(hunt.startBalance)} />
        <Stat label="Winnings" value={usd(s.totalWon)} tone={s.opened && s.profit >= 0 ? 'up' : undefined} />
        <Stat label="Bonuses" value={`${s.opened}/${s.count} opened`} />
        <Stat label="Req X" value={x(s.liveBreakEven ?? s.breakEven)} detail={s.avgRequired !== null ? `${usd(s.avgRequired)} per bonus` : undefined} />
        <Stat label="Run average" value={x(s.average)} detail={s.currentAverage !== null ? `${usd(s.currentAverage)} per bonus` : undefined} />
        <Stat label="Best win" value={s.bestWin ? usd(s.bestWin.payout ?? 0) : '—'} detail={s.bestWin?.game} />
        <Stat label="Lucky win" value={s.luckyWin ? x(bonusMultiplier(s.luckyWin)) : '—'} detail={s.luckyWin?.game} />
        <Stat
          label="Profit/Loss"
          value={s.opened ? `${s.profit < 0 ? '-' : ''}${usd(Math.abs(s.profit))}` : '—'}
          tone={s.opened ? (s.profit >= 0 ? 'up' : 'down') : undefined}
        />
      </ul>

      {hunt.status === 'finished' && s.opened > 0 && (
        <p className={`events-result${s.profit >= 0 ? ' events-result--up' : ''}`}>
          Finished on <strong>{usd(s.totalWon)}</strong>: {s.profit >= 0 ? 'a profit of' : 'down'} {usd(Math.abs(s.profit))}
        </p>
      )}

      {hunt.bonuses.length === 0 ? (
        <p className="events-card events-note">Bonuses show here as they're collected.</p>
      ) : (
        <div className="events-table" role="table" aria-label="Bonuses">
          <div className="events-table__row events-table__row--head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Slot</span>
            <span role="columnheader">Bet</span>
            <span role="columnheader">Payout</span>
            <span role="columnheader">Multiplier</span>
          </div>
          {hunt.bonuses.map((b, i) => {
            const m = bonusMultiplier(b)
            return (
              <div key={b.id} role="row" className={`events-table__row${s.luckyWin?.id === b.id ? ' events-table__row--best' : ''}${b.payout === null ? ' events-table__row--waiting' : ''}`}>
                <span role="cell" className="events-table__index">
                  {i + 1}
                </span>
                <span role="cell" className="events-table__slot">
                  {b.image ? (
                    <img src={b.image.replace('w=300', 'w=80')} width={27} height={36} alt="" loading="lazy" />
                  ) : (
                    <span className="events-table__art" aria-hidden />
                  )}
                  <span className="events-table__text">
                    <span className="events-table__game">
                      {b.game}
                      {b.badge && <span className="events-badge">{b.badge}</span>}
                    </span>
                    {(b.provider || b.note) && (
                      <span className="events-table__provider">
                        {[b.provider, b.note].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </span>
                <span role="cell">{usd(b.bet)}</span>
                <span role="cell" className={b.payout === null ? 'events-muted' : ''}>
                  {b.payout === null ? 'Waiting' : usd(b.payout)}
                </span>
                <span role="cell" className={m !== null && m >= 100 ? 'events-accent' : m === null ? 'events-muted' : ''}>
                  {x(m)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'up' | 'down' }) {
  return (
    <li className="events-stat">
      <span className="events-stat__label">{label}</span>
      <span className={`events-stat__value${tone ? ` events-stat__value--${tone}` : ''}`}>{value}</span>
      {detail && <span className="events-stat__detail">{detail}</span>}
    </li>
  )
}
