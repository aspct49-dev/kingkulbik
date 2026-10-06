import { useState } from 'react'
import type { FormEvent } from 'react'
import { BRACKET_SIZES, championOf, decideByMultiplier, resetMatch, setMultiplier, updatePlayer } from '../../../shared/events'
import type { BracketSize, Match, Tournament } from '../../../shared/events'
import Bracket from '../../components/events/Bracket'
import type { BracketHandlers } from '../../components/events/Bracket'
import { adminPost } from './api'
import SlotPicker from './SlotPicker'
import { ConfirmButton, Field, Input } from './ui'
import { SaveBadge, useAutosave } from './useAutosave'

/** Slot tournaments: build a bracket, publish it, decide each match on the higher multiplier */
export default function TournamentsAdmin({
  tournaments,
  onChange,
  notify,
}: {
  tournaments: Tournament[]
  onChange: (t: Tournament[]) => void
  notify: (message: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(tournaments[0]?.id ?? null)
  const [form, setForm] = useState<{ name: string; prize: string; size: BracketSize }>({ name: '', prize: '', size: 8 })
  const [error, setError] = useState<string | null>(null)
  const current = tournaments.find((t) => t.id === selected) ?? null

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Name the tournament.')
    try {
      const res = await adminPost<{ tournaments: Tournament[] }>('tournaments', { ...form, name: form.name.trim(), prize: form.prize.trim() })
      onChange(res.tournaments)
      setSelected(res.tournaments[0].id)
      setForm((f) => ({ ...f, name: '', prize: '' }))
      notify('Tournament created as a draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={create} noValidate>
        <h2 className="admin-card__title">New tournament</h2>
        <div className="admin-grid">
          <Field label="Name">
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Sunday Slot Battle" maxLength={60} />
          </Field>
          <Field label="Prize">
            <Input value={form.prize} onChange={(v) => setForm((f) => ({ ...f, prize: v }))} placeholder="$250" maxLength={40} />
          </Field>
          <div className="admin-field">
            <span className="admin-field__label" id="t-size">
              Players
            </span>
            <div className="kk-tabs" role="radiogroup" aria-labelledby="t-size">
              {BRACKET_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={form.size === n}
                  className={`kk-tab${form.size === n ? ' kk-tab--selected' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, size: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-actions admin-actions--split">
          <p className="admin-note">Starts as a draft, hidden from the site until you publish it.</p>
          <button type="submit" className="kk-button admin-submit">
            Create bracket
          </button>
        </div>
      </form>

      {tournaments.length > 1 && (
        <div className="kk-tabs admin-picker" role="radiogroup" aria-label="Tournament">
          {tournaments.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={t.id === selected}
              className={`kk-tab${t.id === selected ? ' kk-tab--selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {current ? (
        <TournamentEditor
          key={current.id}
          tournament={current}
          onSaved={onChange}
          notify={notify}
          onDelete={async () => {
            try {
              const res = await adminPost<{ tournaments: Tournament[] }>(`tournaments/${current.id}/delete`)
              onChange(res.tournaments)
              setSelected(res.tournaments[0]?.id ?? null)
              notify('Tournament deleted')
            } catch (err) {
              notify(err instanceof Error ? err.message : 'Could not delete.')
            }
          }}
        />
      ) : (
        <p className="admin-card admin-empty">No tournaments yet. Create one above.</p>
      )}
    </div>
  )
}

const STATUS = { draft: 'Draft (hidden)', live: 'Live', complete: 'Complete' } as const

function TournamentEditor({
  tournament,
  onSaved,
  onDelete,
  notify,
}: {
  tournament: Tournament
  onSaved: (t: Tournament[]) => void
  onDelete: () => void
  notify: (message: string) => void
}) {
  const [status, setStatus] = useState(tournament.status)
  const { value: t, change, flush, state, error } = useAutosave(tournament, async (next) => {
    const res = await adminPost<{ tournaments: Tournament[] }>(`tournaments/${next.id}`, {
      name: next.name,
      prize: next.prize,
      matches: next.matches,
    })
    onSaved(res.tournaments)
    setStatus(res.tournaments.find((x) => x.id === next.id)?.status ?? status)
  })
  const champion = championOf(t.matches)
  const decided = t.matches.filter((m) => m.winner).length

  // Typing saves a moment later; a decision (or undoing one) saves straight away
  const edit = (fn: (m: Match[]) => Match[], now = false) => {
    change((cur) => ({ ...cur, matches: fn(cur.matches) }))
    if (now) void flush()
  }

  const handlers: BracketHandlers = {
    onName: (id, which, name) => edit((all) => updatePlayer(all, id, which, { name })),
    onMult: (id, which, v) => edit((all) => setMultiplier(all, id, which, v)),
    onDecide: (id) => edit((all) => decideByMultiplier(all, id), true),
    onReset: (id) => edit((all) => resetMatch(all, id), true),
    renderSlot: (match, which) => {
      const player = which === 1 ? match.player1 : match.player2
      return player.slot ? (
        <span className="bracket-slot-chip">
          <span>{player.slot}</span>
          <button
            type="button"
            onClick={() => edit((all) => updatePlayer(all, match.id, which, { slot: '', slug: undefined, image: undefined }))}
          >
            Change
          </button>
        </span>
      ) : (
        <SlotPicker
          compact
          placeholder="Pick their slot"
          onPick={(g) => edit((all) => updatePlayer(all, match.id, which, { slot: g.name, slug: g.slug, image: g.image }))}
        />
      )
    },
  }

  const publish = async (next: 'draft' | 'live') => {
    try {
      const res = await adminPost<{ tournaments: Tournament[] }>(`tournaments/${t.id}`, { status: next, matches: t.matches })
      onSaved(res.tournaments)
      setStatus(res.tournaments.find((x) => x.id === t.id)?.status ?? next)
      notify(next === 'live' ? 'Published on the site' : 'Hidden as a draft')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2 className="admin-card__title">
          {t.name}
          <span className="admin-count">
            {decided} of {t.matches.length} matches decided{champion && <> · won by {champion.name}</>}
          </span>
        </h2>
        <div className="admin-row__actions">
          <SaveBadge state={state} error={error} />
          <span className={`admin-chip${status !== 'draft' ? ' admin-chip--on' : ''}`}>{STATUS[status]}</span>
        </div>
      </div>
      <div className="admin-grid">
        <Field label="Name">
          <Input value={t.name} onChange={(v) => change((c) => ({ ...c, name: v }))} maxLength={60} />
        </Field>
        <Field label="Prize">
          <Input value={t.prize} onChange={(v) => change((c) => ({ ...c, prize: v }))} maxLength={40} />
        </Field>
        <div className="admin-field admin-field--end">
          {status === 'draft' ? (
            <button type="button" className="kk-button admin-submit" onClick={() => void publish('live')}>
              Publish
            </button>
          ) : (
            <button type="button" className="admin-button" onClick={() => void publish('draft')}>
              Hide as draft
            </button>
          )}
        </div>
      </div>

      <p className="admin-note">
        Type the players into the first round, pick each one's slot, then enter both multipliers and decide: the higher
        multiplier moves on. Undoing a result also clears every round it fed.
      </p>
      <div className="admin-bracket">
        <Bracket matches={t.matches} handlers={handlers} />
      </div>

      <div className="admin-actions">
        <ConfirmButton label="Delete tournament" confirm="Delete it?" onConfirm={onDelete} />
      </div>
    </section>
  )
}
