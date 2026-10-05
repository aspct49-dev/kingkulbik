import { useEffect, useRef, useState } from 'react'
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

/** Clipboard API where allowed, else the old hidden-textarea copy (e.g. on plain http) */
function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      if (document.execCommand('copy')) resolve()
      else reject(new Error('copy refused'))
    } catch (err) {
      reject(err)
    } finally {
      area.remove()
    }
  })
}

type Toast = { ok: boolean; key: number }

export default function LeaderboardHero({ board, onBoardChange }: LeaderboardHeroProps) {
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // As on the Rekoj site: the button keeps its label and lights a gold ring, and a toast confirms
  const copyCode = () => {
    timers.current.forEach(clearTimeout)
    copyText(AFFILIATE_CODE).then(
      () => {
        setCopied(true)
        setToast({ ok: true, key: Date.now() })
        timers.current = [window.setTimeout(() => setCopied(false), 1200), window.setTimeout(() => setToast(null), 1800)]
      },
      () => {
        setToast({ ok: false, key: Date.now() })
        timers.current = [window.setTimeout(() => setToast(null), 1800)]
      },
    )
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
        <button
          type="button"
          className={`lb-hero__code${copied ? ' lb-hero__code--copied' : ''}`}
          onClick={copyCode}
          aria-label={`Copy code ${AFFILIATE_CODE}`}
        >
          <img src={clipboardIcon} width={17.0974} height={17.9511} alt="" />
          <span>
            Code: <span className="lb-hero__accent">{AFFILIATE_CODE}</span>
          </span>
        </button>
        <a className="lb-hero__visit" href={STAKE_URL} target="_blank" rel="noopener noreferrer">
          Visit
          <img src={stakeLogoDark} width={35} height={17} alt="Stake" />
        </a>
      </div>

      <p className={`lb-toast${toast ? ' lb-toast--visible' : ''}`} role="status" aria-live="polite">
        {toast?.ok && (
          <>
            Code <span className="lb-hero__accent">{AFFILIATE_CODE}</span> copied to clipboard
          </>
        )}
        {toast && !toast.ok && (
          <>
            Couldn't copy. The code is <span className="lb-hero__accent">{AFFILIATE_CODE}</span>
          </>
        )}
      </p>
    </section>
  )
}
