import stakeLogo from '../../assets/leaderboard/stake-logo.svg'
import stakeLogoMuted from '../../assets/leaderboard/stake-logo-muted.svg'
import symbolCoin from '../../assets/leaderboard/symbol-coin.webp'
import symbolRune from '../../assets/leaderboard/symbol-rune.webp'
import FloatingSymbol from '../FloatingSymbol'
import StakeActions from '../StakeActions'
import { BOARDS } from '../../../shared/leaderboard'
import type { BoardId } from '../../../shared/leaderboard'
import './LeaderboardHero.css'

const pickerOptions: { id: BoardId; label: string | null }[] = [
  { id: 'weighted', label: null },
  { id: 'exclusive', label: 'Only on' },
]

type LeaderboardHeroProps = {
  board: BoardId
  onBoardChange: (board: BoardId) => void
  /** The board's prize pool (the current race's, or a finished one's) */
  pool: number
  /** A finished race: its name and dates replace the call to compete */
  finished?: { name: string; dates: string }
}

/**
 * The selected board's monthly prize pool, summed from its prize table (so the
 * title can't drift from the prizes). A two-digit-thousands figure like
 * $40,000 keeps the design's kerning around the zero and the comma.
 */
function PrizePool({ amount }: { amount: number }) {
  const text = amount.toLocaleString('en-US')
  const kerned = /^(\d)(\d),(\d{3})$/.exec(text)
  if (!kerned) return <span className="lb-hero__gold">${text}</span>
  return (
    <>
      <span className="lb-hero__gold">${kerned[1]}</span>
      <span className="lb-hero__gold lb-hero__kern-zero">{kerned[2]}</span>
      <span className="lb-hero__gold lb-hero__kern-comma">,</span>
      <span className="lb-hero__gold">{kerned[3]}</span>
    </>
  )
}

export default function LeaderboardHero({ board, onBoardChange, pool, finished }: LeaderboardHeroProps) {
  return (
    <section className="lb-hero">
      <FloatingSymbol
        className="lb-hero__symbol lb-hero__symbol--coin"
        src={symbolCoin}
        size={{ width: 45.246, height: 44.68 }}
        rotation={0}
        idle={0}
      />
      <FloatingSymbol
        className="lb-hero__symbol lb-hero__symbol--rune"
        src={symbolRune}
        size={49.844}
        rotation={0}
        idle={2.1}
      />

      <div className="lb-hero__picker" role="radiogroup" aria-label="Leaderboard site">
        {pickerOptions.map((option) => {
          const selected = board === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`lb-hero__picker-option${selected ? ' lb-hero__picker-option--selected' : ''}`}
              title={BOARDS[option.id].label}
              aria-label={BOARDS[option.id].label}
              onClick={() => onBoardChange(option.id)}
            >
              {option.label && <span>{option.label}</span>}
              <img src={selected ? stakeLogo : stakeLogoMuted} width={35} height={17} alt="Stake" />
            </button>
          )
        })}
      </div>

      <h1 className="lb-hero__title">
        <span className="lb-hero__title-line lb-hero__title-line--top">
          <PrizePool amount={pool} />{' '}
          <span className="lb-hero__silver">MONTHLY</span>
        </span>{' '}
        <span className="lb-hero__title-line lb-hero__title-line--main lb-hero__gold">LEADERBOARD</span>
      </h1>

      {finished ? (
        <p className="lb-hero__subtitle">
          <span className="lb-hero__accent">{finished.name}</span> final results · {finished.dates}
        </p>
      ) : (
        <p className="lb-hero__subtitle">
          Compete against other players under code <span className="lb-hero__accent">KingKulbik</span> and win
          big rewards!
        </p>
      )}

      <StakeActions className="lb-hero__actions" />

    </section>
  )
}
