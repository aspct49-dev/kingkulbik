import { useState } from 'react'
import type { FormEvent } from 'react'
import { stakeGameUrl } from '../../../shared/content'
import type { Challenge } from '../../../shared/content'
import { adminPost } from './api'
import SlotPicker from './SlotPicker'
import { ConfirmButton, Field, ImageField, Input, num } from './ui'

type Form = { game: string; slug: string; image: string; multiplier: string; minBet: string; reward: string }

const EMPTY: Form = { game: '', slug: '', image: '', multiplier: '', minBet: '', reward: '' }

const usd = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const toForm = (c: Challenge): Form => ({
  game: c.game,
  slug: c.slug ?? '',
  image: c.image,
  multiplier: String(c.multiplier),
  minBet: String(c.minBet),
  reward: String(c.reward),
})

type Props = {
  challenges: Challenge[]
  onChange: (challenges: Challenge[]) => void
  notify: (message: string) => void
}

/** Add, edit, complete and remove slot challenges (games from the Stake catalog) */
export default function ChallengesAdmin({ challenges, onChange, notify }: Props) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const reset = () => {
    setForm(EMPTY)
    setEditing(null)
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const body = {
      game: form.game.trim(),
      slug: form.slug,
      image: form.image,
      multiplier: num(form.multiplier),
      minBet: num(form.minBet),
      reward: num(form.reward),
    }
    if (!body.game) return setError('Pick a game from the catalog or type its name.')
    if (!body.image) return setError('Add an image: pick a catalog game or upload one.')
    if (!(body.multiplier >= 1)) return setError('Enter the target multiplier (1 or more).')
    if (!(body.minBet >= 0)) return setError('Enter the minimum bet in dollars.')
    if (!(body.reward >= 0)) return setError('Enter the reward in dollars.')
    setSaving(true)
    try {
      const res = await adminPost<{ challenges: Challenge[] }>(editing ? `challenges/${editing}` : 'challenges', body)
      onChange(res.challenges)
      notify(editing ? 'Challenge saved' : 'Challenge added')
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const act = async (route: string, body: unknown, message: string) => {
    try {
      const res = await adminPost<{ challenges: Challenge[] }>(route, body)
      onChange(res.challenges)
      notify(message)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const active = challenges.filter((c) => c.status === 'active').length

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={submit} noValidate>
        <div className="admin-card__head">
          <h2 className="admin-card__title">{editing ? 'Edit challenge' : 'New challenge'}</h2>
          {editing && (
            <button type="button" className="admin-button admin-button--quiet" onClick={reset}>
              Cancel
            </button>
          )}
        </div>

        <div className="admin-form admin-form--with-art">
          <ImageField
            value={form.image}
            onChange={set('image')}
            shape="portrait"
            maxEdge={600}
            placeholder="Game art"
          />
          <div className="admin-form__fields">
            <Field label="Stake game" hint="Fills in the name, art and play link. Or type a name and upload art.">
              <SlotPicker onPick={(g) => setForm((f) => ({ ...f, game: g.name, slug: g.slug, image: g.image }))} />
            </Field>
            <div className="admin-grid">
              <Field label="Game name" wide>
                <Input
                  value={form.game}
                  onChange={(v) => setForm((f) => ({ ...f, game: v }))}
                  placeholder="Sweet Bonanza"
                  maxLength={60}
                />
              </Field>
              <Field label="Target multiplier">
                <Input value={form.multiplier} onChange={set('multiplier')} unit="×" inputMode="decimal" placeholder="2500" />
              </Field>
              <Field label="Min. bet">
                <Input value={form.minBet} onChange={set('minBet')} unit="$" inputMode="decimal" placeholder="0.20" />
              </Field>
              <Field label="Reward">
                <Input value={form.reward} onChange={set('reward')} unit="$" inputMode="decimal" placeholder="100" />
              </Field>
            </div>
            {form.slug && (
              <p className="admin-note">
                Links to{' '}
                <a href={stakeGameUrl(form.slug)} target="_blank" rel="noopener noreferrer">
                  stake.com/casino/games/{form.slug}
                </a>{' '}
                <button type="button" className="admin-link" onClick={() => set('slug')('')}>
                  Unlink
                </button>
              </p>
            )}
            {error && <p className="admin-error" role="alert">{error}</p>}
            <div className="admin-actions">
              <button type="submit" className="kk-button admin-submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add challenge'}
              </button>
            </div>
          </div>
        </div>
      </form>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Challenges <span className="admin-count">{active} active · {challenges.length - active} completed</span>
          </h2>
        </div>
        {challenges.length === 0 ? (
          <p className="admin-empty">No challenges yet. Add one above.</p>
        ) : (
          <ul className="admin-list">
            {challenges.map((c) => (
              <ChallengeRow
                key={c.id}
                challenge={c}
                editing={editing === c.id}
                onEdit={() => {
                  setEditing(c.id)
                  setForm(toForm(c))
                  setError(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                onComplete={(winner) =>
                  act(`challenges/${c.id}`, { status: 'completed', completedBy: winner }, 'Marked as won')
                }
                onReopen={() => act(`challenges/${c.id}`, { status: 'active', completedBy: '' }, 'Challenge reopened')}
                onDelete={() => {
                  if (editing === c.id) reset()
                  void act(`challenges/${c.id}/delete`, {}, 'Challenge deleted')
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ChallengeRow({
  challenge: c,
  editing,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
}: {
  challenge: Challenge
  editing: boolean
  onEdit: () => void
  onComplete: (winner: string) => void
  onReopen: () => void
  onDelete: () => void
}) {
  const [completing, setCompleting] = useState(false)
  const [winner, setWinner] = useState('')
  const done = c.status === 'completed'

  return (
    <li className={`admin-row${editing ? ' admin-row--editing' : ''}`}>
      <img className="admin-row__thumb admin-row__thumb--portrait" src={c.image} width={36} height={48} alt="" loading="lazy" />
      <div className="admin-row__main">
        <span className="admin-row__name">{c.game}</span>
        <span className="admin-row__meta">
          {c.multiplier.toLocaleString('en-US')}× · min ${usd(c.minBet)} · <strong>${usd(c.reward)}</strong>
        </span>
      </div>
      <span className={`admin-chip${done ? '' : ' admin-chip--on'}`}>
        {done ? (c.completedBy ? `Won by ${c.completedBy}` : 'Completed') : 'Active'}
      </span>

      {completing ? (
        <form
          className="admin-row__actions"
          onSubmit={(e) => {
            e.preventDefault()
            setCompleting(false)
            onComplete(winner.trim())
          }}
        >
          <span className="admin-input admin-input--small">
            <input
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              placeholder="Winner (optional)"
              maxLength={40}
              aria-label="Winner"
              autoFocus
            />
          </span>
          <button type="submit" className="admin-button admin-button--gold">
            Done
          </button>
          <button type="button" className="admin-button admin-button--quiet" onClick={() => setCompleting(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="admin-row__actions">
          <button type="button" className="admin-button" onClick={onEdit}>
            Edit
          </button>
          {done ? (
            <button type="button" className="admin-button" onClick={onReopen}>
              Reopen
            </button>
          ) : (
            <button type="button" className="admin-button" onClick={() => setCompleting(true)}>
              Complete
            </button>
          )}
          <ConfirmButton label="Delete" confirm="Delete?" onConfirm={onDelete} />
        </div>
      )}
    </li>
  )
}
