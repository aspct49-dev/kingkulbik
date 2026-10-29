import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import bg from '../assets/leaderboard/bg.webp'
import LeaderboardHero from '../components/leaderboard/LeaderboardHero'
import Podium from '../components/leaderboard/Podium'
import Countdown, { RaceEnded } from '../components/leaderboard/Countdown'
import RankingTable from '../components/leaderboard/RankingTable'
import RulesDialog from '../components/leaderboard/RulesDialog'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useArchivedRace, useArchivedRaces } from '../hooks/useLeaderboardArchive'
import { getRaceWindow, prizePool, prizesFor, raceName } from '../../shared/leaderboard'
import type { BoardId } from '../../shared/leaderboard'
import './LeaderboardPage.css'

const utc = (at: number, opts: Intl.DateTimeFormatOptions) => new Date(at).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
/** "Sep 29 – Oct 28" */
const raceDates = (start: number, end: number) => `${utc(start, { month: 'short', day: 'numeric' })} – ${utc(end - 1, { month: 'short', day: 'numeric' })}`

/**
 * The live race, or a finished one (?race=<its first day>, or ?race=latest for
 * the most recent): same hero, podium and table, with that race's prizes.
 */
export default function LeaderboardPage() {
  // The design shows "Only on Stake" selected by default
  const [board, setBoard] = useState<BoardId>('weighted')
  const leaderboard = useLeaderboard(board)
  const [rules, setRules] = useState(false)
  const [params, setParams] = useSearchParams()

  const wanted = params.get('race')
  const viewingPast = wanted !== null
  const list = useArchivedRaces(viewingPast)
  const raceId = wanted === 'latest' ? (list.data?.[0]?.id ?? null) : wanted
  const past = useArchivedRace(viewingPast ? raceId : null)
  const race = past.data

  // The server's window wins; until it answers, the same rule computed locally
  const live = useMemo(() => leaderboard.data?.window ?? getRaceWindow(), [leaderboard.data])
  const prizes = race ? race.boards[board].prizes : prizesFor(board, live.start)
  const entries = race ? race.boards[board].entries : viewingPast ? [] : (leaderboard.data?.entries ?? [])
  const loading = viewingPast ? list.status === 'loading' || past.status === 'loading' : leaderboard.status === 'loading'

  const showRace = (id: string | null) => setParams(id ? { race: id } : {})

  const rulesButton = (
    <button type="button" className="leaderboard-page__pill" aria-haspopup="dialog" onClick={() => setRules(true)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 6.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="4.2" r="0.95" fill="currentColor" />
      </svg>
      RULES
    </button>
  )

  return (
    <div className="leaderboard-page">
      <img className="leaderboard-page__bg" src={bg} alt="" />
      <div className="leaderboard-page__content" aria-busy={loading}>
        <LeaderboardHero
          board={board}
          onBoardChange={setBoard}
          pool={prizePool(prizes)}
          finished={race ? { name: raceName(race), dates: raceDates(race.start, race.end) } : undefined}
        />
        <Podium entries={entries} prizes={prizes} />

        {!viewingPast ? (
          <>
            <Countdown end={live.end} />
            <div className="leaderboard-page__pills">
              {rulesButton}
              <button type="button" className="leaderboard-page__pill" onClick={() => showRace('latest')}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M2.2 7a4.8 4.8 0 1 0 1.4-3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M1.6 1.6v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 4.4V7l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                PREVIOUS LEADERBOARDS
              </button>
            </div>
          </>
        ) : (
          <>
            {race && <RaceEnded end={race.end} />}
            {list.data && list.data.length > 1 && (
              <div className="leaderboard-page__pills" role="radiogroup" aria-label="Finished leaderboard">
                {list.data.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={r.id === raceId}
                    className={`leaderboard-page__pill${r.id === raceId ? ' leaderboard-page__pill--selected' : ''}`}
                    onClick={() => showRace(r.id)}
                  >
                    {raceName(r).toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <div className="leaderboard-page__pills">
              <button type="button" className="leaderboard-page__pill" onClick={() => showRace(null)}>
                <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden>
                  <path d="M6.5 1.5 1.5 6.5l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                CURRENT LEADERBOARD
              </button>
              {rulesButton}
            </div>
            {(list.status === 'error' || past.status === 'error') && (
              <p className="leaderboard-page__notice" role="status">
                Couldn’t load this leaderboard. Please try again shortly.
              </p>
            )}
            {list.status === 'ready' && !list.data?.length && (
              <p className="leaderboard-page__notice" role="status">
                No finished leaderboards yet. They’re kept here as each month ends.
              </p>
            )}
          </>
        )}

        <RulesDialog open={rules} onClose={() => setRules(false)} />
        {!viewingPast && leaderboard.status === 'error' && (
          <p className="leaderboard-page__notice" role="status">
            {leaderboard.data
              ? 'Live standings are temporarily unavailable. Showing the last update.'
              : 'Live standings are temporarily unavailable. Please check back shortly.'}
          </p>
        )}
        <RankingTable entries={entries} prizes={prizes} />
      </div>
    </div>
  )
}
