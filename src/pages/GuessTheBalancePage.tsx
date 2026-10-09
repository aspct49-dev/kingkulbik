import { useState } from 'react'
import type { FormEvent } from 'react'
import guessIcon from '../assets/events/guess-icon.svg'
import EventBanner from '../components/events/EventBanner'
import { socials } from '../data/links'
import type { PublicGuessRound } from '../../shared/events'
import { signInUrl, useAuth } from '../hooks/useAuth'
import { useGuessRound } from '../hooks/useEvents'
import './ChallengesPage.css'
import './AccountPage.css'
import '../components/BetPanel.css'
import '../components/events/EventBlocks.css'
import './GuessTheBalancePage.css'

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const multi = (v: number) => `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`

const STAGE: Record<PublicGuessRound['status'], { chip: string; detail: string }> = {
  open: { chip: 'Taking guesses', detail: 'Guess where the hunt finishes. You can change it until entries close.' },
  closed: { chip: 'Entries closed', detail: 'The hunt is being opened. The winner is drawn when it finishes.' },
  drawn: { chip: 'Winner drawn', detail: 'This round is settled. A new one opens with the next hunt.' },
}

/** Guess where the bonus hunt finishes; the closest guess wins the prize */
export default function GuessTheBalancePage() {
  const { status, data, refresh } = useGuessRound()
  const round = data?.round ?? null

  return (
    <div className="section-page">
      <div className="gtb">
        <EventBanner top="GUESS THE" main="BALANCE" />

        {status === 'loading' ? (
          <div className="ev-loading" aria-label="Loading" />
        ) : round ? (
          <RoundView round={round} onGuessed={refresh} />
        ) : (
          <>
            <section className="ev-bar">
              <span className="ev-bar__icon" aria-hidden>
                <img src={guessIcon} width={26} height={26} alt="" />
              </span>
              <span className="ev-bar__text">
                <span className="ev-bar__title">No round open right now</span>
                <span className="ev-bar__detail">A round opens with every bonus hunt on stream. Catch the next one live.</span>
              </span>
              <a className="kk-button ev-bar__action" href={socials.kick.url} target="_blank" rel="noopener noreferrer">
                Watch on Kick
              </a>
            </section>
            <HowItWorks />
          </>
        )}
      </div>
    </div>
  )
}

function RoundView({ round, onGuessed }: { round: PublicGuessRound; onGuessed: () => void }) {
  const hunt = round.hunt
  const stage = STAGE[round.status]
  const opening = hunt && hunt.opened > 0
  // Figures typed in by an admin win over the hunt's
  const start = round.startBalance ?? hunt?.startBalance ?? null
  const bonuses = round.bonusCount ?? hunt?.count ?? null

  return (
    <>
      <section className="ev-bar">
        <span className="ev-bar__icon" aria-hidden>
          <img src={guessIcon} width={26} height={26} alt="" />
        </span>
        <span className="ev-bar__text">
          <span className="ev-bar__title">
            {round.name}
            {round.prize && (
              <>
                {' '}
                · <span className="ev-accent">{round.prize}</span> prize
              </>
            )}
          </span>
          <span className="ev-bar__detail">{stage.detail}</span>
        </span>
        <span className={`ev-chip ev-chip--${round.status}`}>{stage.chip}</span>
      </section>

      <ul className="ev-stats">
        <Stat label="Start balance" value={start !== null ? usd(start) : '—'} />
        <Stat
          label="Bonuses"
          value={bonuses === null ? '—' : opening ? `${hunt.opened}/${bonuses} opened` : bonuses.toLocaleString('en-US')}
        />
        <Stat
          label={opening ? 'Paid so far' : 'Break-even'}
          value={hunt ? (opening ? usd(hunt.totalWon) : hunt.breakEven !== null ? multi(hunt.breakEven) : '—') : '—'}
        />
        <Stat label="Guesses" value={round.count.toLocaleString('en-US')} />
      </ul>

      {round.status === 'drawn' && round.finalBalance !== null ? (
        <Result round={round} />
      ) : (
        <div className="gtb-play">
          <GuessCard round={round} onGuessed={onGuessed} />
          <HowItWorks compact />
        </div>
      )}

      {round.status === 'drawn' && round.standings.length > 0 && <Standings round={round} />}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="ev-stat">
      <span className="ev-stat__label">{label}</span>
      <span className="ev-stat__value">{value}</span>
    </li>
  )
}

/** The guess form, or what's shown instead of it */
function GuessCard({ round, onGuessed }: { round: PublicGuessRound; onGuessed: () => void }) {
  const { status, user } = useAuth()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const mine = round.mine

  if (status === 'loading') return <section className="ev-card gtb-guess" aria-busy />

  if (round.status !== 'open') {
    return (
      <section className="ev-card gtb-guess">
        <h2 className="ev-card__title">Entries are closed</h2>
        {mine ? (
          <>
            <p className="ev-card__text">Your guess is locked in. Good luck!</p>
            <p className="gtb-mine">
              <span className="gtb-mine__label">Your guess</span>
              <span className="gtb-mine__value">{usd(mine.value)}</span>
            </p>
          </>
        ) : (
          <p className="ev-card__text">
            The hunt is being opened on stream. Follow along and see who called it when the final balance lands.
          </p>
        )}
      </section>
    )
  }

  if (!user) {
    return (
      <section className="ev-card gtb-guess">
        <h2 className="ev-card__title">Make your guess</h2>
        <p className="ev-card__text">Sign in with Kick to enter. One guess per account, free to play.</p>
        <a className="kk-button gtb-guess__signin" href={signInUrl('/guess-the-balance')}>
          Sign in to guess
        </a>
      </section>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(value.replace(/[,$\s]/g, ''))
    if (!(n > 0)) return setMessage({ error: true, text: 'Enter the balance you think the hunt finishes on.' })
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/events/guess', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: n }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setMessage({ error: true, text: body.error ?? 'Could not save your guess.' })
      else {
        setMessage({ error: false, text: mine ? `Guess updated to ${usd(n)}.` : `Guess locked in at ${usd(n)}. Good luck!` })
        setValue('')
        onGuessed()
      }
    } catch {
      setMessage({ error: true, text: 'Could not reach the server. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ev-card gtb-guess" onSubmit={submit} noValidate>
      <h2 className="ev-card__title">{mine ? 'Change your guess' : 'Make your guess'}</h2>
      <p className="ev-card__text">Where does the hunt finish? Closest to the final balance wins.</p>
      {mine && (
        <p className="gtb-mine">
          <span className="gtb-mine__label">Your guess</span>
          <span className="gtb-mine__value">{usd(mine.value)}</span>
        </p>
      )}
      <label className="gtb-label" htmlFor="gtb-value">
        Final balance
      </label>
      <div className="gtb-guess__row">
        <div className="bet-field gtb-guess__field">
          <span className="gtb-guess__unit" aria-hidden>
            $
          </span>
          <input
            id="gtb-value"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/[^\d.,]/g, ''))
              setMessage(null)
            }}
            inputMode="decimal"
            placeholder={(round.startBalance ?? round.hunt?.startBalance)?.toLocaleString('en-US') ?? '2,500.00'}
            autoComplete="off"
          />
        </div>
        <button type="submit" className="kk-button gtb-guess__submit" disabled={busy || !value}>
          {busy ? 'Saving…' : mine ? 'Update' : 'Submit guess'}
        </button>
      </div>
      {message && (
        <p className={`gtb-message${message.error ? ' gtb-message--error' : ''}`} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  )
}

const STEPS = [
  { title: 'Guess the finish', text: 'Sign in and enter where you think the bonus hunt ends.' },
  { title: 'Watch it open', text: 'Entries close as the bonuses start opening on stream.' },
  { title: 'Closest wins', text: 'Nearest to the final balance takes the prize. Ties go to the earlier guess.' },
]

function HowItWorks({ compact }: { compact?: boolean }) {
  return (
    <section className={`ev-card ev-how${compact ? ' ev-how--compact' : ''}`}>
      <h2 className="ev-card__title">How it works</h2>
      <ol className="ev-how__steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="ev-how__step">
            <span className="ev-how__n">{i + 1}</span>
            <span>
              <span className="ev-how__title">{s.title}</span>
              <span className="ev-how__text">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The final balance and who called it */
function Result({ round }: { round: PublicGuessRound }) {
  const winner = round.standings[0]
  const mine = round.mine ? round.standings.find((g) => g.at === round.mine!.at && g.value === round.mine!.value) : undefined
  return (
    <section className="ev-card gtb-result">
      <div className="gtb-result__final">
        <span className="gtb-result__label">Final balance</span>
        <span className="gtb-result__value">{usd(round.finalBalance!)}</span>
      </div>
      {winner ? (
        <div className="gtb-result__winner">
          <span className="gtb-result__crown" aria-hidden>
            ♛
          </span>
          <span className="gtb-result__who">
            <span className="gtb-result__name">{winner.name}</span>
            <span className="gtb-result__detail">
              Guessed {usd(winner.value)}, off by {usd(winner.offBy)}
            </span>
          </span>
          {round.prize && <span className="gtb-result__prize">{round.prize}</span>}
        </div>
      ) : (
        <p className="ev-card__text">Nobody guessed this round.</p>
      )}
      {round.mine && (
        <p className="ev-card__text gtb-result__you">
          You guessed <strong>{usd(round.mine.value)}</strong>
          {mine ? (
            <>
              {' '}
              and placed <strong>#{mine.place}</strong>
            </>
          ) : null}
          .
        </p>
      )}
    </section>
  )
}

/** Leaderboard-style standings, closest first */
function Standings({ round }: { round: PublicGuessRound }) {
  return (
    <section className="gtb-standings" aria-labelledby="gtb-standings-title">
      <div className="gtb-standings__head">
        <h2 id="gtb-standings-title" className="ev-section">
          Standings
        </h2>
        <span className="gtb-standings__count">
          Top {round.standings.length} of {round.count.toLocaleString('en-US')}
        </span>
      </div>
      <div className="ev-table" role="table" aria-label="Closest guesses">
        <div className="ev-table__row ev-table__row--head" role="row">
          <span role="columnheader">Place</span>
          <span role="columnheader">Player</span>
          <span role="columnheader">Guess</span>
          <span role="columnheader">Off by</span>
        </div>
        {round.standings.map((g) => {
          const you = round.mine && round.mine.at === g.at && round.mine.value === g.value
          return (
            <div key={g.place} role="row" className={`ev-table__row${g.place === 1 ? ' ev-table__row--first' : ''}${you ? ' ev-table__row--you' : ''}`}>
              <span role="cell">
                <span className="ev-table__place">{g.place}</span>
              </span>
              <span role="cell" className="ev-table__name">
                {g.name}
                {you && <span className="ev-table__you">You</span>}
              </span>
              <span role="cell" className="ev-table__guess">
                {usd(g.value)}
              </span>
              <span role="cell" className="ev-table__off">
                {usd(g.offBy)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
