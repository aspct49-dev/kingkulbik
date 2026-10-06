import { useState } from 'react'
import type { FormEvent } from 'react'
import coinIcon from '../../assets/coin.svg'
import type { ItemTier, StoreItem } from '../../../shared/content'
import { StoreCard } from '../ItemStorePage'
import { adminPost } from './api'
import { ConfirmButton, Field, ImageField, Input, Toggle, num } from './ui'

type Form = { name: string; price: string; tier: ItemTier; image: string; stock: string; hidden: boolean }

const EMPTY: Form = { name: '', price: '', tier: 'gold', image: '', stock: '', hidden: false }

const TIERS: { id: ItemTier; label: string }[] = [
  { id: 'gold', label: 'Gold' },
  { id: 'purple', label: 'Purple' },
  { id: 'blue', label: 'Blue' },
]

const points = (value: number) => value.toLocaleString('en-US')

const toForm = (item: StoreItem): Form => ({
  name: item.name,
  price: String(item.price),
  tier: item.tier,
  image: item.image ?? '',
  stock: item.stock === null ? '' : String(item.stock),
  hidden: Boolean(item.hidden),
})

type Props = {
  items: StoreItem[]
  onChange: (items: StoreItem[]) => void
  notify: (message: string) => void
}

/** Add and edit Item Store products: name, price in King Points, card colour, photo, stock */
export default function ShopAdmin({ items, onChange, notify }: Props) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<StoreItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setForm(EMPTY)
    setEditing(null)
    setError(null)
  }

  const price = num(form.price)
  const stock = form.stock.trim() === '' ? null : num(form.stock)

  // The card as the store will show it (hand-placed photos keep their spot)
  const preview: StoreItem = {
    id: 'preview',
    name: form.name.trim() || 'Item name',
    price: Number.isFinite(price) ? Math.round(price) : 0,
    tier: form.tier,
    ...(form.image ? { image: form.image } : {}),
    ...(editing?.imageBox && form.image === editing.image ? { imageBox: editing.imageBox } : {}),
    stock: stock !== null && Number.isFinite(stock) ? stock : null,
    createdAt: 0,
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Give the item a name.')
    if (!(price >= 0)) return setError('Enter the price in King Points.')
    if (stock !== null && !(stock >= 0)) return setError('Stock is a whole number, or empty for unlimited.')
    setSaving(true)
    try {
      const res = await adminPost<{ shop: StoreItem[] }>(editing ? `shop/${editing.id}` : 'shop', {
        name: form.name.trim(),
        price: Math.round(price),
        tier: form.tier,
        image: form.image,
        stock: stock === null ? null : Math.round(stock),
        hidden: form.hidden,
      })
      onChange(res.shop)
      notify(editing ? 'Item saved' : 'Item added')
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const act = async (route: string, body: unknown, message: string) => {
    try {
      const res = await adminPost<{ shop: StoreItem[] }>(route, body)
      onChange(res.shop)
      notify(message)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const visible = items.filter((i) => !i.hidden).length

  return (
    <div className="admin-stack">
      <form className="admin-card" onSubmit={submit} noValidate>
        <div className="admin-card__head">
          <h2 className="admin-card__title">{editing ? 'Edit item' : 'New item'}</h2>
          {editing && (
            <button type="button" className="admin-button admin-button--quiet" onClick={reset}>
              Cancel
            </button>
          )}
        </div>

        <div className="admin-form admin-form--with-preview">
          <div className="admin-preview">
            <span className="admin-field__label">Preview</span>
            <ul className="admin-preview__card" inert>
              <StoreCard item={preview} buy={preview.stock === 0 ? { kind: 'sold-out' } : { kind: 'buy' }} />
            </ul>
          </div>

          <div className="admin-form__fields">
            <div className="admin-grid">
              <Field label="Name" wide>
                <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="PlayStation 5" maxLength={40} />
              </Field>
              <Field label="Price">
                <Input
                  value={form.price}
                  onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                  unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
                  inputMode="numeric"
                  placeholder="250,000"
                />
              </Field>
              <Field label="Stock" hint="Empty for unlimited">
                <Input
                  value={form.stock}
                  onChange={(v) => setForm((f) => ({ ...f, stock: v }))}
                  inputMode="numeric"
                  placeholder="Unlimited"
                />
              </Field>
            </div>

            <div className="admin-field">
              <span className="admin-field__label" id="shop-tier-label">
                Card colour
              </span>
              <div className="kk-tabs admin-tiers" role="radiogroup" aria-labelledby="shop-tier-label">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={form.tier === t.id}
                    className={`kk-tab${form.tier === t.id ? ' kk-tab--selected' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, tier: t.id }))}
                  >
                    <span className={`admin-tier-dot admin-tier-dot--${t.id}`} aria-hidden />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-field">
              <span className="admin-field__label">Photo</span>
              <ImageField
                value={form.image}
                onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                shape="square"
                maxEdge={400}
                placeholder="No photo"
              />
              <span className="admin-field__hint">A cut-out PNG or WebP looks best. Without one the card shows the shopping bag.</span>
            </div>

            <Toggle
              checked={form.hidden}
              onChange={(hidden) => setForm((f) => ({ ...f, hidden }))}
              label="Hidden from the store"
            />

            {error && <p className="admin-error" role="alert">{error}</p>}
            <div className="admin-actions">
              <button type="submit" className="kk-button admin-submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
              </button>
            </div>
          </div>
        </div>
      </form>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Items <span className="admin-count">{visible} in the store · {items.length - visible} hidden</span>
          </h2>
        </div>
        {items.length === 0 ? (
          <p className="admin-empty">No items yet. Add one above.</p>
        ) : (
          <ul className="admin-list">
            {items.map((item) => (
              <li key={item.id} className={`admin-row${editing?.id === item.id ? ' admin-row--editing' : ''}`}>
                <span className={`admin-row__thumb admin-row__thumb--tier admin-row__thumb--${item.tier}`}>
                  {item.image && <img src={item.image} width={36} height={36} alt="" loading="lazy" />}
                </span>
                <div className="admin-row__main">
                  <span className="admin-row__name">{item.name}</span>
                  <span className="admin-row__meta">
                    <img src={coinIcon} width={11} height={11} alt="" /> {points(item.price)} ·{' '}
                    {item.stock === null ? 'Unlimited' : item.stock === 0 ? 'Sold out' : `${points(item.stock)} left`}
                  </span>
                </div>
                <span className={`admin-chip${item.hidden ? '' : ' admin-chip--on'}`}>{item.hidden ? 'Hidden' : 'In store'}</span>
                <div className="admin-row__actions">
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => {
                      setEditing(item)
                      setForm(toForm(item))
                      setError(null)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => act(`shop/${item.id}`, { hidden: !item.hidden }, item.hidden ? 'Item shown' : 'Item hidden')}
                  >
                    {item.hidden ? 'Show' : 'Hide'}
                  </button>
                  <ConfirmButton
                    label="Delete"
                    confirm="Delete?"
                    onConfirm={() => {
                      if (editing?.id === item.id) reset()
                      void act(`shop/${item.id}/delete`, {}, 'Item deleted')
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
