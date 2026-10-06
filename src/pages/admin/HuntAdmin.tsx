import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { bonusMultiplier, huntStats } from '../../../shared/events'
import type { Hunt, HuntBonus, HuntStatus } from '../../../shared/events'
import { adminPost } from './api'
import SlotPicker from './SlotPicker'
import type { SlotGame } from './SlotPicker'
import { ConfirmButton, Field, Input, num } from './ui'
import { SaveBadge, useAutosave } from './useAutosave'

const STATUSES: { id: HuntStatus; label: string }[] = [
  { id: 'collecting', label: 'Collecting' },
  { id: 'opening', label: 'Opening' },
  { id: 'finished', label: 'Finished' },
]

const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const x = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}×`)

/** Bonus hunts: buy bonuses (collecting), then enter each payout as it opens */
export default function HuntAdmin({
  hunts,
  onChange,
  notify,
}: {
  hunts: Hunt[]
  onChange: (hunts: Hunt[]) => void
  notify: (message: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(hunts[0]?.id ?? null)
  const [form, setForm] = useState({ name: '', startBalance: '' })
  const [error, setError] = useState<string | null>(null)
  const hunt = hunts.find((h) => h.id === selected) ?? null

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const startBalance = num(form.startBalance)
    if (!form.name.trim()) return setError('Name the hunt.')
    if (!(startBalance >= 0)) return setError('Enter the start balance in dollars.')
    try {
      const res = await adminPost<{ hunts: Hunt[] }>('hunts', { name: form.name.trim(), startBalance })
      onChange(res.hunts)
      setSelected(res.hunts[0].id)
      setForm({ name: '', startBalance: '' })
      notify('Hunt created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={create} noValidate>
        <h2 className="admin-card__title">New bonus hunt</h2>
        <div className="admin-grid">
          <Field label="Name" wide>
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Friday night hunt" maxLength={60} />
          </Field>
          <Field label="Start balance">
            <Input value={form.startBalance} onChange={(v) => setForm((f) => ({ ...f, startBalance: v }))} unit="$" inputMode="decimal" placeholder="2,000" />
          </Field>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-actions">
          <button type="submit" className="kk-button admin-submit">
            Create hunt
          </button>
        </div>
      </form>

      {hunts.length > 1 && (
        <div className="kk-tabs admin-picker" role="radiogroup" aria-label="Hunt">
          {hunts.slice(0, 6).map((h) => (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={h.id === selected}
              className={`kk-tab${h.id === selected ? ' kk-tab--selected' : ''}`}
              onClick={() => setSelected(h.id)}
            >
              {h.name}
            </button>
          ))}
        </div>
      )}

      {hunt ? (
        <HuntEditor
          key={hunt.id}
          hunt={hunt}
          onSaved={onChange}
          onDelete={async () => {
            try {
              const res = await adminPost<{ hunts: Hunt[] }>(`hunts/${hunt.id}/delete`)
              onChange(res.hunts)
              setSelected(res.hunts[0]?.id ?? null)
              notify('Hunt deleted')
            } catch (err) {
              notify(err instanceof Error ? err.message : 'Could not delete.')
            }
          }}
        />
      ) : (
        <p className="admin-card admin-empty">No hunts yet. Create one above.</p>
      )}
    </div>
  )
}

function HuntEditor({ hunt: initial, onSaved, onDelete }: { hunt: Hunt; onSaved: (h: Hunt[]) => void; onDelete: () => void }) {
  const { value: hunt, change, state, error } = useAutosave(initial, async (h) => {
    const res = await adminPost<{ hunts: Hunt[] }>(`hunts/${h.id}`, h)
    onSaved(res.hunts)
  })
  const [pick, setPick] = useState<SlotGame | null>(null)
  const [bet, setBet] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [start, setStart] = useState(String(initial.startBalance))
  const stats = huntStats(hunt)

  useEffect(() => setStart(String(initial.startBalance)), [initial.id, initial.startBalance])

  const setBonus = (id: string, patch: Partial<HuntBonus>) =>
    change((h) => ({ ...h, bonuses: h.bonuses.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))

  const add = (e: FormEvent) => {
    e.preventDefault()
    const size = num(bet)
    if (!pick) return setAddError('Pick the slot.')
    if (!(size > 0)) return setAddError('Enter the bet size.')
    setAddError(null)
    change((h) => ({
      ...h,
      bonuses: [
        ...h.bonuses,
        { id: Math.random().toString(36).slice(2, 10), game: pick.name, slug: pick.slug, image: pick.image, provider: pick.provider, bet: size, payout: null },
      ],
    }))
    setPick(null)
  }

  return (
    <>
      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">{hunt.name}</h2>
          <SaveBadge state={state} error={error} />
        </div>
        <div className="admin-grid">
          <Field label="Name" wide>
            <Input value={hunt.name} onChange={(v) => change((h) => ({ ...h, name: v }))} maxLength={60} />
          </Field>
          <Field label="Start balance">
            <Input
              value={start}
              onChange={(v) => {
                setStart(v)
                const n = num(v)
                if (n >= 0) change((h) => ({ ...h, startBalance: n }))
              }}
              unit="$"
              inputMode="decimal"
            />
          </Field>
          <div className="admin-field">
            <span className="admin-field__label" id={`hunt-status-${hunt.id}`}>
              Stage
            </span>
            <div className="kk-tabs" role="radiogroup" aria-labelledby={`hunt-status-${hunt.id}`}>
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={hunt.status === s.id}
                  className={`kk-tab${hunt.status === s.id ? ' kk-tab--selected' : ''}`}
                  onClick={() => change((h) => ({ ...h, status: s.id }))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ul className="admin-stats admin-stats--hunt">
          <HuntStat label="Bonuses" value={`${stats.opened}/${stats.count} opened`} />
          <HuntStat label="Total won" value={usd(stats.totalWon)} />
          <HuntStat label="Break-even" value={x(stats.breakEven)} />
          <HuntStat label="Needed now" value={x(stats.liveBreakEven)} />
          <HuntStat label="Average" value={x(stats.average)} />
        </ul>
      </section>

      <form className="admin-card" onSubmit={add} noValidate>
        <h2 className="admin-card__title">Add a bonus</h2>
        <div className="admin-hunt-add">
          <Field label="Slot">
            {pick ? (
              <span className="admin-picked">
                <img src={pick.image.replace('w=300', 'w=80')} width={24} height={32} alt="" />
                <span>{pick.name}</span>
                <button type="button" className="admin-link" onClick={() => setPick(null)}>
                  Change
                </button>
              </span>
            ) : (
              <SlotPicker onPick={setPick} />
            )}
          </Field>
          <Field label="Bet size">
            <Input value={bet} onChange={setBet} unit="$" inputMode="decimal" placeholder="1.00" />
          </Field>
          <button type="submit" className="kk-button admin-submit admin-hunt-add__button">
            Add bonus
          </button>
        </div>
        {addError && <p className="admin-error" role="alert">{addError}</p>}
      </form>

      <section className="admin-card">
        <h2 className="admin-card__title">
          Bonuses <span className="admin-count">enter each payout as it opens</span>
        </h2>
        {hunt.bonuses.length === 0 ? (
          <p className="admin-empty">No bonuses yet.</p>
        ) : (
          <ol className="admin-list">
            {hunt.bonuses.map((b, i) => (
              <BonusRow
                key={b.id}
                index={i + 1}
                bonus={b}
                best={stats.best?.id === b.id}
                onChange={(patch) => setBonus(b.id, patch)}
                onRemove={() => change((h) => ({ ...h, bonuses: h.bonuses.filter((x) => x.id !== b.id) }))}
              />
            ))}
          </ol>
        )}
        <div className="admin-actions">
          <ConfirmButton label="Delete hunt" confirm="Delete this hunt?" onConfirm={onDelete} />
        </div>
      </section>
    </>
  )
}

function HuntStat({ label, value }: { label: string; value: string }) {
  return (
    <li className="admin-stat">
      <span className="admin-stat__label">{label}</span>
      <span className="admin-stat__value">{value}</span>
    </li>
  )
}

function BonusRow({
  index,
  bonus,
  best,
  onChange,
  onRemove,
}: {
  index: number
  bonus: HuntBonus
  best: boolean
  onChange: (patch: Partial<HuntBonus>) => void
  onRemove: () => void
}) {
  const [bet, setBet] = useState(String(bonus.bet))
  const [payout, setPayout] = useState(bonus.payout === null ? '' : String(bonus.payout))
  const multi = bonusMultiplier(bonus)

  return (
    <li className={`admin-row${best ? ' admin-row--best' : ''}`}>
      <span className="admin-row__index">{index}</span>
      {bonus.image ? (
        <img className="admin-row__thumb" src={bonus.image.replace('w=300', 'w=80')} width={30} height={40} alt="" loading="lazy" />
      ) : (
        <span className="admin-row__thumb admin-row__thumb--empty" />
      )}
      <span className="admin-row__main">
        <span className="admin-row__name">{bonus.game}</span>
        <span className="admin-row__meta">{bonus.provider}</span>
      </span>
      <span className="admin-input admin-input--small admin-input--unit admin-input--money">
        <span className="admin-input__unit">$</span>
        <input
          value={bet}
          aria-label={`${bonus.game} bet`}
          inputMode="decimal"
          onChange={(e) => {
            setBet(e.target.value)
            const n = num(e.target.value)
            if (n >= 0) onChange({ bet: n })
          }}
        />
      </span>
      <span className="admin-input admin-input--small admin-input--unit admin-input--money">
        <span className="admin-input__unit">$</span>
        <input
          value={payout}
          aria-label={`${bonus.game} payout`}
          placeholder="Payout"
          inputMode="decimal"
          onChange={(e) => {
            setPayout(e.target.value)
            const v = e.target.value.trim()
            const n = num(v)
            if (v === '') onChange({ payout: null })
            else if (n >= 0) onChange({ payout: n })
          }}
        />
      </span>
      <span className={`admin-row__multi${multi !== null && multi >= 100 ? ' admin-row__multi--big' : ''}`}>{x(multi)}</span>
      <button type="button" className="giveaway-names__remove" aria-label={`Remove ${bonus.game}`} onClick={onRemove}>
        ×
      </button>
    </li>
  )
}
