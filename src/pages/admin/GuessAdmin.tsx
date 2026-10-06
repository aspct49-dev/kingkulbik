import { useState } from 'react'
import type { FormEvent } from 'react'
import { huntStats, rankGuesses } from '../../../shared/events'
import type { GuessRound, Hunt } from '../../../shared/events'
import { Avatar } from '../../components/profile/ProfileSections'
import { adminPost } from './api'
import { ConfirmButton, Field, Input, num } from './ui'

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Open a round on a hunt, close entries when the opening starts, then draw on the final balance */
export default function GuessAdmin({
  rounds,
  hunts,
  onChange,
  notify,
}: {
  rounds: GuessRound[]
  hunts: Hunt[]
  onChange: (rounds: GuessRound[]) => void
  notify: (message: string) => void
}) {
  const [form, setForm] = useState({ name: '', prize: '', huntId: hunts[0]?.id ?? '' })
  const [error, setError] = useState<string | null>(null)
  const round = rounds.find((r) => r.status !== 'drawn') ?? rounds[0] ?? null

  const act = async (route: string, body: unknown, message: string) => {
    try {
      const res = await adminPost<{ guesses: GuessRound[] }>(route, body)
      onChange(res.guesses)
      notify(message)
      return true
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
      return false
    }
  }

  const open = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Name the round.')
    try {
      const res = await adminPost<{ guesses: GuessRound[] }>('guess', { name: form.name.trim(), prize: form.prize.trim(), huntId: form.huntId || null })
      onChange(res.guesses)
      setForm((f) => ({ ...f, name: '', prize: '' }))
      notify('Round open for guesses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={open} noValidate>
        <h2 className="admin-card__title">Open a round</h2>
        <div className="admin-grid">
          <Field label="Name">
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Friday night guess" maxLength={60} />
          </Field>
          <Field label="Prize">
            <Input value={form.prize} onChange={(v) => setForm((f) => ({ ...f, prize: v }))} placeholder="$100" maxLength={40} />
          </Field>
          <Field label="Bonus hunt">
            <span className="admin-input admin-select">
              <select value={form.huntId} onChange={(e) => setForm((f) => ({ ...f, huntId: e.target.value }))}>
                <option value="">No hunt</option>
                {hunts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </span>
          </Field>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-actions admin-actions--split">
          <p className="admin-note">Opening a round closes any other round still taking guesses: the page shows one at a time.</p>
          <button type="submit" className="kk-button admin-submit">
            Open round
          </button>
        </div>
      </form>

      {round && <RoundPanel key={round.id} round={round} hunt={hunts.find((h) => h.id === round.huntId) ?? null} act={act} />}

      {rounds.length > 1 && (
        <section className="admin-card">
          <h2 className="admin-card__title">All rounds</h2>
          <ul className="admin-list">
            {rounds.map((r) => (
              <li key={r.id} className="admin-row">
                <span className="admin-row__main">
                  <span className="admin-row__name">{r.name}</span>
                  <span className="admin-row__meta">
                    {r.guesses.length} guesses{r.finalBalance !== null && <> · settled on {usd(r.finalBalance)}</>}
                  </span>
                </span>
                <span className={`admin-chip${r.status === 'open' ? ' admin-chip--on' : ''}`}>{STATUS[r.status]}</span>
                <div className="admin-row__actions">
                  <ConfirmButton label="Delete" confirm="Delete?" onConfirm={() => void act(`guess/${r.id}/delete`, {}, 'Round deleted')} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const STATUS = { open: 'Taking guesses', closed: 'Entries closed', drawn: 'Drawn' } as const

function RoundPanel({
  round,
  hunt,
  act,
}: {
  round: GuessRound
  hunt: Hunt | null
  act: (route: string, body: unknown, message: string) => Promise<boolean>
}) {
  const huntWon = hunt ? huntStats(hunt).totalWon : null
  const [final, setFinal] = useState(
    round.finalBalance !== null ? String(round.finalBalance) : hunt?.status === 'finished' && huntWon !== null ? String(huntWon) : '',
  )
  const ranked = rankGuesses(round)
  const rows = ranked.length
    ? ranked
    : [...round.guesses].sort((a, b) => a.value - b.value).map((g) => ({ ...g, place: 0, offBy: null as number | null }))

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2 className="admin-card__title">
          {round.name}
          <span className="admin-count">
            {round.guesses.length} {round.guesses.length === 1 ? 'guess' : 'guesses'}
            {round.prize && <> · prize {round.prize}</>}
            {hunt && <> · {hunt.name}</>}
          </span>
        </h2>
        <span className={`admin-chip${round.status === 'open' ? ' admin-chip--on' : ''}`}>{STATUS[round.status]}</span>
      </div>

      <div className="admin-actions admin-actions--split">
        <div className="admin-row__actions">
          {round.status === 'open' ? (
            <button type="button" className="admin-button" onClick={() => void act(`guess/${round.id}`, { status: 'closed' }, 'Entries closed')}>
              Close entries
            </button>
          ) : (
            <button type="button" className="admin-button" onClick={() => void act(`guess/${round.id}`, { status: 'open' }, 'Entries open')}>
              {round.status === 'drawn' ? 'Undo draw and reopen' : 'Reopen entries'}
            </button>
          )}
        </div>
        <form
          className="admin-row__actions"
          onSubmit={(e) => {
            e.preventDefault()
            const n = num(final)
            if (n >= 0) void act(`guess/${round.id}/draw`, { finalBalance: n }, 'Winner drawn')
          }}
        >
          <span className="admin-input admin-input--small admin-input--unit">
            <span className="admin-input__unit">$</span>
            <input value={final} onChange={(e) => setFinal(e.target.value)} placeholder="Final balance" inputMode="decimal" aria-label="Final balance" />
          </span>
          <button type="submit" className="admin-button admin-button--gold" disabled={!(num(final) >= 0)}>
            {round.status === 'drawn' ? 'Redraw' : 'Draw winner'}
          </button>
        </form>
      </div>
      {hunt && huntWon !== null && round.status !== 'drawn' && (
        <p className="admin-note">
          {hunt.name} has paid {usd(huntWon)} so far
          {hunt.status === 'finished' ? ' and is finished: that figure is filled in above.' : '.'}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="admin-empty">No guesses yet.</p>
      ) : (
        <ol className="admin-list">
          {rows.map((g) => (
            <li key={g.userId} className={`admin-row${g.place === 1 ? ' admin-row--best' : ''}`}>
              {g.place > 0 && <span className="admin-row__index">{g.place}</span>}
              <Avatar src={g.avatar} name={g.name} size={32} />
              <span className="admin-row__main">
                <span className="admin-row__name">{g.name}</span>
                <span className="admin-row__meta">Discord {g.userId}</span>
              </span>
              <span className="admin-row__figures">
                <span>{usd(g.value)}</span>
                {g.offBy !== null && <span>off by {usd(g.offBy)}</span>}
              </span>
              <div className="admin-row__actions">
                <ConfirmButton label="Remove" confirm="Remove?" onConfirm={() => void act(`guess/${round.id}/remove`, { userId: g.userId }, 'Guess removed')} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
