import { useMemo, useState } from 'react'
import bg from '../assets/leaderboard/bg.webp'
import LeaderboardHero from '../components/leaderboard/LeaderboardHero'
import Podium from '../components/leaderboard/Podium'
import Countdown from '../components/leaderboard/Countdown'
import RankingTable from '../components/leaderboard/RankingTable'
import RulesDialog from '../components/leaderboard/RulesDialog'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { BOARDS, getRaceWindow } from '../../shared/leaderboard'
import type { BoardId } from '../../shared/leaderboard'
import './LeaderboardPage.css'

export default function LeaderboardPage() {
  // The design shows "Only on Stake" selected by default
  const [board, setBoard] = useState<BoardId>('weighted')
  const leaderboard = useLeaderboard(board)
  const [rules, setRules] = useState(false)

  const prizes = BOARDS[board].prizes
  const entries = leaderboard.data?.entries ?? []
  // The server's window wins; until it answers, the same rule computed locally
  const raceEnd = useMemo(() => leaderboard.data?.window.end ?? getRaceWindow().end, [leaderboard.data])

  return (
    <div className="leaderboard-page">
      <img className="leaderboard-page__bg" src={bg} alt="" />
      <div className="leaderboard-page__content" aria-busy={leaderboard.status === 'loading'}>
        <LeaderboardHero board={board} onBoardChange={setBoard} />
        <Podium entries={entries} prizes={prizes} />
        <Countdown end={raceEnd} />
        <button type="button" className="leaderboard-page__rules" aria-haspopup="dialog" onClick={() => setRules(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <circle cx="7" cy="7" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 6.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="7" cy="4.2" r="0.95" fill="currentColor" />
          </svg>
          RULES
        </button>
        <RulesDialog open={rules} onClose={() => setRules(false)} />
        {leaderboard.status === 'error' && (
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
