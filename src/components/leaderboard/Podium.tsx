import card1st from '../../assets/leaderboard/card-1st.webp'
import card2nd from '../../assets/leaderboard/card-2nd.webp'
import card3rd from '../../assets/leaderboard/card-3rd.webp'
import badge1st from '../../assets/leaderboard/badge-1st.svg'
import badge2nd from '../../assets/leaderboard/badge-2nd.svg'
import badge3rd from '../../assets/leaderboard/badge-3rd.svg'
import prize1st from '../../assets/leaderboard/prize-1st.svg'
import prize2nd from '../../assets/leaderboard/prize-2nd.svg'
import prize3rd from '../../assets/leaderboard/prize-3rd.svg'
import trophyIcon from '../../assets/leaderboard/trophy.svg'
import trophy3rdIcon from '../../assets/leaderboard/trophy-3rd.svg'
import { formatUsd, podiumAvatars } from '../../data/leaderboard'
import type { LeaderboardEntry } from '../../../shared/leaderboard'
import './Podium.css'

const placeArt = {
  1: { card: card1st, badge: badge1st, prize: prize1st, trophy: trophyIcon },
  2: { card: card2nd, badge: badge2nd, prize: prize2nd, trophy: trophyIcon },
  3: { card: card3rd, badge: badge3rd, prize: prize3rd, trophy: trophy3rdIcon },
}

type PodiumCardProps = {
  place: 1 | 2 | 3
  entry?: LeaderboardEntry
  prize: number
}

function PodiumCard({ place, entry, prize }: PodiumCardProps) {
  const art = placeArt[place]

  return (
    <li className={`podium-card podium-card--${place}`}>
      <img className="podium-card__bg" src={art.card} width={281} height={349} alt="" />
      <img className="podium-card__avatar" src={podiumAvatars[place]} width={121} height={121} alt="" />
      <span className="podium-card__badge" aria-label={`Place ${place}`}>
        <img src={art.badge} width={27.7128} height={31.3812} alt="" />
        <span>{place}</span>
      </span>
      <p className="podium-card__name">{entry?.name ?? '—'}</p>
      <div className="podium-card__wagered">
        <span className="podium-card__wagered-label">Weighted</span>
        <span className="podium-card__wagered-value">{entry ? `$${formatUsd(entry.weighted)}` : '—'}</span>
      </div>
      <div className="podium-card__prize">
        <img className="podium-card__prize-bg" src={art.prize} width={209.684} height={60} alt="" />
        <span className="podium-card__prize-amount">${formatUsd(prize)}</span>
        <img className="podium-card__trophy" src={art.trophy} width={11.9742} height={11.9742} alt="" />
      </div>
    </li>
  )
}

type PodiumProps = {
  entries: LeaderboardEntry[]
  prizes: number[]
}

export default function Podium({ entries, prizes }: PodiumProps) {
  return (
    <ol className="podium" aria-label="Top 3">
      {([1, 2, 3] as const).map((place) => (
        <PodiumCard key={place} place={place} entry={entries[place - 1]} prize={prizes[place - 1] ?? 0} />
      ))}
    </ol>
  )
}
