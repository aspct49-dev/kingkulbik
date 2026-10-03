import { useState } from 'react'
import stakeLogo from '../../assets/leaderboard/stake-logo.svg'
import stakeLogoMuted from '../../assets/leaderboard/stake-logo-muted.svg'
import stakeLogoDark from '../../assets/leaderboard/stake-logo-dark.svg'
import clipboardIcon from '../../assets/leaderboard/clipboard.svg'
import symbolHigh3 from '../../assets/leaderboard/symbol-high3.png'
import symbolM2 from '../../assets/leaderboard/symbol-m2.png'
import FloatingSymbol from '../FloatingSymbol'
import { AFFILIATE_CODE } from '../../data/leaderboard'
import { STAKE_URL } from '../../data/links'
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
}

export default function LeaderboardHero({ board, onBoardChange }: LeaderboardHeroProps) {
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(AFFILIATE_CODE)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); the code stays visible.
    }
  }

  return (
    <section className="lb-hero">
      <FloatingSymbol
        className="lb-hero__symbol lb-hero__symbol--high3"
        src={symbolHigh3}
        size={56.184}
        rotation={-10.1}
      />
      <FloatingSymbol
        className="lb-hero__symbol lb-hero__symbol--m2"
        src={symbolM2}
        size={34.434}
        rotation={14.2}
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
          <span className="lb-hero__gold">$4</span>
          <span className="lb-hero__gold lb-hero__kern-zero">0</span>
          <span className="lb-hero__gold lb-hero__kern-comma">,</span>
          <span className="lb-hero__gold">000</span>{' '}
          <span className="lb-hero__silver">MONTHLY</span>
        </span>
        <span className="lb-hero__title-line lb-hero__title-line--main lb-hero__gold">LEADERBOARD</span>
      </h1>

      <p className="lb-hero__subtitle">
        Compete against other players under code <span className="lb-hero__accent">KingKulbik</span> and win
        big rewards!
      </p>

      <div className="lb-hero__actions">
        <button type="button" className="lb-hero__code" onClick={copyCode} aria-label={`Copy code ${AFFILIATE_CODE}`}>
          <img src={clipboardIcon} width={17.0974} height={17.9511} alt="" />
          {copied ? (
            <span className="lb-hero__accent">Copied!</span>
          ) : (
            <span>
              Code: <span className="lb-hero__accent">{AFFILIATE_CODE}</span>
            </span>
          )}
        </button>
        <a className="lb-hero__visit" href={STAKE_URL} target="_blank" rel="noopener noreferrer">
          Visit
          <img src={stakeLogoDark} width={35} height={17} alt="Stake" />
        </a>
      </div>
    </section>
  )
}
