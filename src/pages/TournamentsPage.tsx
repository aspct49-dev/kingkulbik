import { useState } from 'react'
import tournamentIcon from '../assets/events/tournament-icon.svg'
import Bracket from '../components/events/Bracket'
import EventsEmpty from '../components/events/EventsEmpty'
import PageHeading from '../components/PageHeading'
import { championOf } from '../../shared/events'
import { useTournaments } from '../hooks/useEvents'
import './ChallengesPage.css'
import './EventsPages.css'

const STATUS = { draft: 'Draft', live: 'Live', complete: 'Complete' } as const

/** Slot battles from the stream: highest multiplier goes through */
export default function TournamentsPage() {
  const { status, data } = useTournaments()
  const tournaments = data?.tournaments ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const current = tournaments.find((t) => t.id === selected) ?? tournaments.find((t) => t.status === 'live') ?? tournaments[0]

  return (
    <div className="section-page">
      <div className="events events--wide">
        <PageHeading icon={tournamentIcon} gold="SLOT" rest="TOURNAMENTS">
          Head-to-head slot battles from the stream. The <span className="page-heading__accent">HIGHEST MULTIPLIER</span>{' '}
          goes through.
        </PageHeading>

        {status === 'loading' ? (
          <div className="events-loading" aria-label="Loading" />
        ) : !current ? (
          <EventsEmpty
            icon={tournamentIcon}
            title="No tournament yet"
            text="Brackets are played live on stream. The next one shows here as soon as it's drawn."
          />
        ) : (
          <>
            {tournaments.length > 1 && (
              <div className="kk-tabs events-picker" role="radiogroup" aria-label="Tournament">
                {tournaments.slice(0, 6).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={t.id === current.id}
                    className={`kk-tab${t.id === current.id ? ' kk-tab--selected' : ''}`}
                    onClick={() => setSelected(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div className="events-title">
              <h2 className="events-title__name">{current.name}</h2>
              <span className={`events-chip events-chip--${current.status}`}>{STATUS[current.status]}</span>
              {current.prize && <span className="events-title__prize">Prize {current.prize}</span>}
              {championOf(current.matches) && (
                <span className="events-title__prize">Won by {championOf(current.matches)!.name}</span>
              )}
            </div>
            <section className="events-card events-bracket">
              <Bracket matches={current.matches} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
