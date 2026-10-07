import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { bonusMultiplier, currencySymbol, HUNT_BADGES, HUNT_CURRENCIES, huntMoney, huntStats } from '../../../shared/events'
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

const x = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}×`)
const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Bonus hunts: collect bonuses, then enter each payout as it opens */
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
  const [form, setForm] = useState({ name: '', startBalance: '', currency: 'USD' })
  const [error, setError] = useState<string | null>(null)
  const hunt = hunts.find((h) => h.id === selected) ?? null

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const startBalance = num(form.startBalance)
    if (!form.name.trim()) return setError('Name the hunt.')
    if (!(startBalance >= 0)) return setError('Enter the start cost in dollars.')
    try {
      const res = await adminPost<{ hunts: Hunt[] }>('hunts', { name: form.name.trim(), startBalance, currency: form.currency })
      onChange(res.hunts)
      setSelected(res.hunts[0].id)
      setForm((f) => ({ ...f, name: '', startBalance: '' }))
      notify('Hunt created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={create} noValidate>
        <h2 className="admin-card__title">Create new hunt</h2>
        <div className="hunt-create">
          <Field label="Hunt name">
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Friday night hunt" maxLength={60} />
          </Field>
          <Field label="Start cost">
            <Input
              value={form.startBalance}
              onChange={(v) => setForm((f) => ({ ...f, startBalance: v }))}
              unit={currencySymbol(form.currency)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </Field>
          <Field label="Currency">
            <CurrencySelect value={form.currency} onChange={(currency) => setForm((f) => ({ ...f, currency }))} />
          </Field>
          <button type="submit" className="kk-button admin-submit hunt-create__button">
            Create hunt
          </button>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </form>

      {hunts.length > 1 && (
        <div className="kk-tabs admin-picker" role="radiogroup" aria-label="Hunt">
          {hunts.map((h) => (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={h.id === selected}
              className={`kk-tab${h.id === selected ? ' kk-tab--selected' : ''}`}
              onClick={() => setSelected(h.id)}
            >
              {h.number ? `#${h.number} ` : ''}
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
          notify={notify}
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

function HuntEditor({
  hunt: initial,
  onSaved,
  onDelete,
  notify,
}: {
  hunt: Hunt
  onSaved: (h: Hunt[]) => void
  onDelete: () => void
  notify: (message: string) => void
}) {
  const { value: hunt, change, state, error } = useAutosave(initial, async (h) => {
    const res = await adminPost<{ hunts: Hunt[] }>(`hunts/${h.id}`, h)
    onSaved(res.hunts)
  })
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [start, setStart] = useState(String(initial.startBalance))
  const s = huntStats(hunt)
  const currency = hunt.currency ?? 'USD'
  const usd = (v: number) => huntMoney(v, currency)
  const money = (v: number | null) => (v === null ? '—' : usd(v))

  useEffect(() => setStart(String(initial.startBalance)), [initial.id, initial.startBalance])

  const setBonus = (id: string, patch: Partial<HuntBonus>) =>
    change((h) => ({ ...h, bonuses: h.bonuses.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))

  const q = search.trim().toLowerCase()
  const rows = hunt.bonuses.map((b, i) => ({ b, n: i + 1 })).filter(({ b }) => !q || b.game.toLowerCase().includes(q))

  return (
    <>
      <section className="admin-card hunt-board">
        <div className="hunt-board__head">
          <h2 className="hunt-board__title">
            {hunt.number && <span className="hunt-board__number">#{hunt.number}</span>}
            {hunt.name} <span className="hunt-board__date">- {day(hunt.createdAt)}</span>
          </h2>
          <SaveBadge state={state} error={error} />
        </div>

        <div className="hunt-board__actions">
          <button type="button" className="kk-button admin-submit" onClick={() => setAdding(true)}>
            + Add bonus
          </button>
          <button type="button" className="admin-button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <div className="kk-tabs" role="radiogroup" aria-label="Stage">
            {STATUSES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={hunt.status === st.id}
                className={`kk-tab${hunt.status === st.id ? ' kk-tab--selected' : ''}`}
                onClick={() => change((h) => ({ ...h, status: st.id }))}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {editing && (
          <div className="hunt-create hunt-create--edit">
            <Field label="Hunt name">
              <Input value={hunt.name} onChange={(v) => change((h) => ({ ...h, name: v }))} maxLength={60} />
            </Field>
            <Field label="Start cost">
              <Input
                value={start}
                onChange={(v) => {
                  setStart(v)
                  const n = num(v)
                  if (n >= 0) change((h) => ({ ...h, startBalance: n }))
                }}
                unit={currencySymbol(currency)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={(c) => change((h) => ({ ...h, currency: c }))} />
            </Field>
          </div>
        )}

        <ul className="hunt-stats">
          <BigStat label="Bonuses" value={String(s.count)} />
          <BigStat label="Start cost" value={usd(hunt.startBalance)} />
          <BigStat label="Winnings" value={usd(s.totalWon)} />
          <BigStat label="Profit/Loss" value={usd(s.profit)} tone={s.opened ? (s.profit >= 0 ? 'up' : 'down') : undefined} />
        </ul>
        <ul className="hunt-stats hunt-stats--small">
          <SmallStat label="Avg req" value={money(s.avgRequired)} />
          <SmallStat label="Cur avg" value={money(s.currentAverage)} />
          <SmallStat label="Total X" value={x(s.totalX)} />
          <SmallStat label="Req X" value={x(s.liveBreakEven ?? s.breakEven)} />
          <SmallStat label="Cur avg X" value={x(s.average)} />
        </ul>
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Bonuses <span className="admin-count">{s.opened}/{s.count} opened · enter each payout as it opens</span>
          </h2>
        </div>
        {hunt.bonuses.length > 0 && (
          <span className="admin-input hunt-search">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a game…" aria-label="Search bonuses" />
          </span>
        )}
        {hunt.bonuses.length === 0 ? (
          <p className="admin-empty">No bonuses yet. Add the first one above.</p>
        ) : rows.length === 0 ? (
          <p className="admin-empty">No bonus matches “{search.trim()}”.</p>
        ) : (
          <ol className="admin-list hunt-rows">
            <li className="hunt-row hunt-row--head" aria-hidden>
              <span>#</span>
              <span />
              <span>Slot</span>
              <span>Bet</span>
              <span>Payout</span>
              <span className="hunt-row__multi">Multi</span>
              <span />
            </li>
            {rows.map(({ b, n }) => (
              <BonusRow
                key={b.id}
                index={n}
                bonus={b}
                best={s.bestWin?.id === b.id}
                lucky={s.luckyWin?.id === b.id}
                symbol={currencySymbol(currency)}
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

      <AddBonusDialog
        symbol={currencySymbol(currency)}
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(bonus) => {
          change((h) => ({ ...h, bonuses: [...h.bonuses, bonus] }))
          notify(`${bonus.game} added`)
        }}
      />
    </>
  )
}

function BigStat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <li className="hunt-stat">
      <span className="hunt-stat__label">{label}</span>
      <span className={`hunt-stat__value${tone ? ` hunt-stat__value--${tone}` : ''}`}>{value}</span>
    </li>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <li className="hunt-stat hunt-stat--small">
      <span className="hunt-stat__label">{label}</span>
      <span className="hunt-stat__value">{value}</span>
    </li>
  )
}

/** "Add Bonus to Hunt": slot, bet size, an optional note and badge */
function AddBonusDialog({
  symbol,
  open,
  onClose,
  onAdd,
}: {
  symbol: string
  open: boolean
  onClose: () => void
  onAdd: (bonus: HuntBonus) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [pick, setPick] = useState<SlotGame | null>(null)
  // The bet is kept between bonuses: hunts are usually bought at one size
  const [bet, setBet] = useState('')
  const [note, setNote] = useState('')
  const [badge, setBadge] = useState<'none' | (typeof HUNT_BADGES)[number] | 'custom'>('none')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setPick(null)
      setNote('')
      setBadge('none')
      setCustom('')
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const size = num(bet)
    if (!pick) return setError('Pick the slot.')
    if (!(size > 0)) return setError('Enter the bet size.')
    const label = badge === 'none' ? '' : badge === 'custom' ? custom.trim() : badge
    if (badge === 'custom' && !label) return setError('Type the custom badge, or pick None.')
    onAdd({
      id: Math.random().toString(36).slice(2, 10),
      game: pick.name,
      slug: pick.slug,
      image: pick.image,
      provider: pick.provider,
      bet: size,
      payout: null,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(label ? { badge: label } : {}),
    })
    onClose()
  }

  return (
    <dialog ref={ref} className="hunt-dialog" aria-labelledby="hunt-dialog-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <form className="hunt-dialog__body" onSubmit={submit} noValidate>
          <header className="hunt-dialog__head">
            <h2 id="hunt-dialog-title" className="hunt-dialog__title">
              <span aria-hidden>+</span> Add bonus to hunt
            </h2>
            <button type="button" className="hunt-dialog__close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>

          <Field label="Search for slot">
            {pick ? (
              <span className="admin-picked">
                <img src={pick.image.replace('w=300', 'w=80')} width={24} height={32} alt="" />
                <span>
                  {pick.name}
                  <span className="admin-row__meta"> · {pick.provider}</span>
                </span>
                <button type="button" className="admin-link" onClick={() => setPick(null)}>
                  Change
                </button>
              </span>
            ) : (
              <SlotPicker onPick={setPick} placeholder="Search for a slot game…" />
            )}
          </Field>
          <Field label="Bet size">
            <Input value={bet} onChange={setBet} unit={symbol} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={setNote} placeholder="Add any notes about this bonus…" maxLength={80} />
          </Field>
          <div className="admin-field">
            <span className="admin-field__label" id="hunt-badge-label">
              Badge (optional)
            </span>
            <div className="hunt-badges" role="radiogroup" aria-labelledby="hunt-badge-label">
              {(['none', ...HUNT_BADGES, 'custom'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={badge === b}
                  className={`hunt-badge-choice${badge === b ? ' hunt-badge-choice--on' : ''}`}
                  onClick={() => setBadge(b)}
                >
                  {b === 'none' ? 'None' : b === 'custom' ? 'Custom' : b}
                </button>
              ))}
            </div>
            {badge === 'custom' && <Input value={custom} onChange={setCustom} placeholder="Badge text, e.g. Max level" maxLength={24} />}
          </div>

          {error && <p className="admin-error" role="alert">{error}</p>}
          <div className="hunt-dialog__actions">
            <button type="button" className="admin-button" onClick={onClose}>
              Cancel <kbd>Esc</kbd>
            </button>
            <button type="submit" className="kk-button admin-submit">
              Add bonus
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

function BonusRow({
  index,
  bonus,
  best,
  lucky,
  symbol,
  onChange,
  onRemove,
}: {
  index: number
  bonus: HuntBonus
  best: boolean
  lucky: boolean
  symbol: string
  onChange: (patch: Partial<HuntBonus>) => void
  onRemove: () => void
}) {
  const [bet, setBet] = useState(String(bonus.bet))
  const [payout, setPayout] = useState(bonus.payout === null ? '' : String(bonus.payout))
  const multi = bonusMultiplier(bonus)

  return (
    <li className={`admin-row hunt-row${best || lucky ? ' admin-row--best' : ''}`}>
      <span className="admin-row__index hunt-row__n">{index}</span>
      {bonus.image ? (
        <img className="admin-row__thumb hunt-row__art" src={bonus.image.replace('w=300', 'w=80')} width={30} height={40} alt="" loading="lazy" />
      ) : (
        <span className="admin-row__thumb admin-row__thumb--empty hunt-row__art" />
      )}
      <span className="admin-row__main hunt-row__main">
        <span className="admin-row__name">
          {bonus.game}
          {bonus.badge && <span className="hunt-badge">{bonus.badge}</span>}
          {(best || lucky) && (
            <span className="hunt-badge hunt-badge--gold">{best && lucky ? 'Best & lucky win' : best ? 'Best win' : 'Lucky win'}</span>
          )}
        </span>
        <span className="admin-row__meta">
          {bonus.provider}
          {bonus.note && <> · {bonus.note}</>}
        </span>
      </span>
      <span className="admin-input admin-input--small admin-input--unit hunt-row__bet">
        <span className="admin-input__unit">{symbol}</span>
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
      <span className="admin-input admin-input--small admin-input--unit hunt-row__pay">
        <span className="admin-input__unit">{symbol}</span>
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
      <span className={`hunt-row__multi${multi !== null && multi >= 100 ? ' hunt-row__multi--big' : ''}${multi === null ? ' hunt-row__multi--none' : ''}`}>
        {x(multi)}
      </span>
      <button type="button" className="hunt-row__del" aria-label={`Remove ${bonus.game}`} title="Remove" onClick={onRemove}>
        ×
      </button>
    </li>
  )
}

function CurrencySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <span className="admin-input admin-select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Currency">
        {HUNT_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {currencySymbol(c.code)}  {c.code} · {c.name}
          </option>
        ))}
      </select>
    </span>
  )
}
