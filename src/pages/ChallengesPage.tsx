import { useMemo, useState } from 'react'
import swordsIcon from '../assets/challenges/swords.svg'
import filterIcon from '../assets/challenges/filter.svg'
import CopyCodeButton from '../components/CopyCodeButton'
import PageHeading from '../components/PageHeading'
import SortSelect from '../components/SortSelect'
import { CHALLENGES } from '../data/challenges'
import { socials } from '../data/links'
import type { Challenge } from '../data/challenges'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './ChallengesPage.css'

type Sort = 'reward-asc' | 'reward-desc'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'reward-asc', label: 'Reward: Ascending' },
  { value: 'reward-desc', label: 'Reward: Descending' },
]

const usd = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const { phase, handlers } = useHoverAnimation()
  const { game, image, multiplier, minBet, reward } = challenge
  const target = `${multiplier.toLocaleString('en-US')}x`

  return (
    <li className={`challenge-card hover-anim hover-anim--${phase}`} {...handlers}>
      <div className="challenge-card__art">
        <img src={image} width={139} height={186} alt={game} loading="lazy" />
      </div>
      <div className="challenge-card__body">
        <h2 className="challenge-card__game">{game}</h2>
        <p className="challenge-card__goal">
          {target} with min. ${usd(minBet)} bet
        </p>
        <dl className="challenge-card__rows">
          <div className="challenge-card__row">
            <dt>Multiplier</dt>
            <dd>
              {multiplier.toLocaleString('en-US')}
              <span className="challenge-card__accent">x</span>
            </dd>
          </div>
          <div className="challenge-card__row">
            <dt>Min.bet</dt>
            <dd>
              <span className="challenge-card__accent">$</span>
              {usd(minBet)}
            </dd>
          </div>
          <div className="challenge-card__row challenge-card__row--reward">
            <dt>Reward</dt>
            <dd>
              <span className="challenge-card__accent">$</span>
              {usd(reward)}
            </dd>
          </div>
        </dl>
        {/* Claims are handled in the Discord */}
        <a
          className="kk-button challenge-card__claim"
          href={socials.discord.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Claim Reward
        </a>
      </div>
    </li>
  )
}

/** Active slot challenges: hit the target multiplier at the minimum bet under the code to claim the prize */
export default function ChallengesPage() {
  const [sort, setSort] = useState<Sort>('reward-asc')

  const challenges = useMemo(
    () => [...CHALLENGES].sort((a, b) => (sort === 'reward-asc' ? a.reward - b.reward : b.reward - a.reward)),
    [sort],
  )

  return (
    <div className="section-page">
      <div className="challenges">
        <PageHeading icon={swordsIcon} gold="ACTIVE" rest="CHALLENGES">
          Play under code <span className="page-heading__accent">KINGKULBIK</span> hit target multipliers &amp; claim
          prizes!
        </PageHeading>

        <div className="challenges__filter">
          <span className="challenges__filter-label">
            <img src={filterIcon} width={16} height={16} alt="" />
            FILTER
          </span>
          <SortSelect className="challenges__sort" value={sort} options={SORTS} onChange={setSort} />
          <CopyCodeButton className="challenges__code" />
        </div>

        <ul className="challenges__grid">
          {challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </ul>
      </div>
    </div>
  )
}
