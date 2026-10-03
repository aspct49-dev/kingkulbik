import placeIcon from '../../assets/leaderboard/icon-place.svg'
import userIcon from '../../assets/leaderboard/icon-user.svg'
import rewardIcon from '../../assets/leaderboard/icon-reward.svg'
import { formatUsd, rowAvatar } from '../../data/leaderboard'
import type { LeaderboardEntry } from '../../../shared/leaderboard'
import './RankingTable.css'

type RankingTableProps = {
  entries: LeaderboardEntry[]
  prizes: number[]
}

/** Places 4 and down, one row per paid place; unclaimed places show a dash. */
export default function RankingTable({ entries, prizes }: RankingTableProps) {
  const places = prizes.map((prize, i) => ({ place: i + 1, prize, entry: entries[i] })).slice(3)

  return (
    <div className="ranking-table" role="table" aria-label={`Places 4 to ${prizes.length}`}>
      <div className="ranking-table__head" role="row">
        <span role="columnheader">
          <img src={placeIcon} width={14} height={14} alt="" />
          Place
        </span>
        <span role="columnheader">
          <img src={userIcon} width={12.8335} height={14} alt="" />
          User
        </span>
        <span role="columnheader">
          <span className="ranking-table__head-dollar">$</span>
          Weighted
        </span>
        <span role="columnheader">
          <img src={rewardIcon} width={13.9998} height={13.9998} alt="" />
          Reward
        </span>
      </div>

      {places.map(({ place, prize, entry }) => {
        const avatar = rowAvatar(place)
        return (
          <div className="ranking-table__row" role="row" key={place}>
            <span role="cell">
              <span className="ranking-table__place">{place}</span>
            </span>
            <span role="cell" className="ranking-table__user">
              <img
                className={`ranking-table__avatar ranking-table__avatar--${avatar.shape}`}
                src={avatar.src}
                alt=""
              />
              {entry?.name ?? '—'}
            </span>
            <span role="cell" className="ranking-table__wagered">
              {entry ? (
                <>
                  <span className="ranking-table__dollar">$</span>
                  {formatUsd(entry.weighted, 2)}
                </>
              ) : (
                '—'
              )}
            </span>
            <span role="cell" className="ranking-table__reward">
              <span className="ranking-table__dollar">$</span>
              {formatUsd(prize)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
