import { useEffect, useRef } from 'react'
import './RulesDialog.css'

/** How much of a bet's wager counts towards the leaderboard, by the game's RTP */
const RULES = [
  { share: '100%', title: 'RTP ≤ 98%', text: 'Full wager counts (e.g. Sports @ 97%)' },
  { share: '50%', title: 'RTP > 98%', text: 'Half wager counts' },
  { share: '10%', title: 'RTP ≥ 99%', text: 'Minimal contribution (e.g. Blackjack)' },
  { share: '0%', title: 'Poker', text: 'Poker wager does not count', none: true },
]

/** The leaderboard's wager contribution rules, opened from the button under the countdown */
export default function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Focus starts on the rules, not the close button (no ring after a click; Tab still reaches it)
      dialog.querySelector<HTMLElement>('.lb-rules__body')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const close = () => ref.current?.close()

  return (
    <dialog
      ref={ref}
      className="lb-rules"
      aria-labelledby="lb-rules-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="lb-rules__body" tabIndex={-1}>
        <header className="lb-rules__head">
          <h2 id="lb-rules-title" className="lb-rules__title">
            Wager Contribution Rules
          </h2>
          <button type="button" className="lb-rules__close" aria-label="Close the rules" onClick={close}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="m1.5 1.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <p className="lb-rules__intro">
          Wager is weighted by game RTP to ensure fair competition. Higher RTP games contribute less to the leaderboard.
        </p>
        <ul className="lb-rules__list">
          {RULES.map((r) => (
            <li key={r.share} className="lb-rules__rule">
              <span className={`lb-rules__share${r.none ? ' lb-rules__share--none' : ''}`}>{r.share}</span>
              <span className="lb-rules__rule-title">{r.title}</span>
              <span className="lb-rules__rule-text">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  )
}
