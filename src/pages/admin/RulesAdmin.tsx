import { useState } from 'react'
import type { FormEvent } from 'react'
import coinIcon from '../../assets/coin.svg'
import gemIcon from '../../assets/keno/gem.svg'
import { DEFAULT_RULES } from '../../../shared/originals'
import type { GameId, GameRules, OriginalsRules } from '../../../shared/originals'
import { adminPost } from './api'
import { Field, Input, Toggle, num } from './ui'

type GameForm = { enabled: boolean; houseEdge: string; minBet: string; maxBet: string; maxWin: string }

const GAMES: { id: GameId; name: string; icon: string }[] = [
  { id: 'keno', name: 'Keno', icon: gemIcon },
  { id: 'coinflip', name: 'Coinflip', icon: coinIcon },
]

const toForm = (r: GameRules): GameForm => ({
  enabled: r.enabled,
  houseEdge: String(Math.round(r.houseEdge * 1000) / 10),
  minBet: String(r.minBet),
  maxBet: String(r.maxBet),
  maxWin: String(r.maxWin),
})

const fromForm = (f: GameForm) => ({
  enabled: f.enabled,
  houseEdge: num(f.houseEdge) / 100,
  minBet: num(f.minBet),
  maxBet: num(f.maxBet),
  maxWin: num(f.maxWin),
})

function check(name: string, f: GameForm): string | null {
  const r = fromForm(f)
  if (!(r.houseEdge >= 0.01 && r.houseEdge <= 0.6)) return `${name}: house edge is 1–60%.`
  if (!(r.minBet > 0)) return `${name}: enter a minimum bet.`
  if (!(r.maxBet >= r.minBet)) return `${name}: the max bet can't be below the min bet.`
  if (!(r.maxWin >= r.maxBet)) return `${name}: the max win can't be below the max bet.`
  return null
}

type Props = {
  rules: OriginalsRules
  onChange: (rules: OriginalsRules) => void
  notify: (message: string) => void
}

/** House edge, bet limits and max win for each original */
export default function RulesAdmin({ rules, onChange, notify }: Props) {
  const [form, setForm] = useState<Record<GameId, GameForm>>({ keno: toForm(rules.keno), coinflip: toForm(rules.coinflip) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (game: GameId, patch: Partial<GameForm>) => setForm((f) => ({ ...f, [game]: { ...f[game], ...patch } }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = check('Keno', form.keno) ?? check('Coinflip', form.coinflip)
    setError(problem)
    if (problem) return
    setSaving(true)
    try {
      const res = await adminPost<{ rules: OriginalsRules }>('rules', {
        keno: fromForm(form.keno),
        coinflip: fromForm(form.coinflip),
      })
      onChange(res.rules)
      setForm({ keno: toForm(res.rules.keno), coinflip: toForm(res.rules.coinflip) })
      notify('Rules saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="admin-stack" onSubmit={submit} noValidate>
      <p className="admin-intro">
        The originals are a side game: a high edge and tight caps keep them from being a shortcut to the Item Store.
        Changes apply to the next bet. Every result stays provably fair.
      </p>
      <div className="admin-rules">
        {GAMES.map((g) => {
          const f = form[g.id]
          const edge = num(f.houseEdge)
          return (
            <section key={g.id} className="admin-card">
              <div className="admin-card__head">
                <h2 className="admin-card__title admin-card__title--icon">
                  <img src={g.icon} width={16} height={16} alt="" />
                  {g.name}
                </h2>
                <Toggle checked={f.enabled} onChange={(enabled) => set(g.id, { enabled })} label={f.enabled ? 'Open' : 'Closed'} />
              </div>
              <div className="admin-grid admin-grid--two">
                <Field label="House edge" hint={Number.isFinite(edge) ? `Players get back ${(100 - edge).toFixed(1).replace(/\.0$/, '')}% on average` : undefined}>
                  <Input value={f.houseEdge} onChange={(v) => set(g.id, { houseEdge: v })} unit="%" inputMode="decimal" />
                </Field>
                <Field label={g.id === 'coinflip' ? 'Max win per game' : 'Max win per bet'}>
                  <Input
                    value={f.maxWin}
                    onChange={(v) => set(g.id, { maxWin: v })}
                    unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Min. bet">
                  <Input
                    value={f.minBet}
                    onChange={(v) => set(g.id, { minBet: v })}
                    unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Max. bet">
                  <Input
                    value={f.maxBet}
                    onChange={(v) => set(g.id, { maxBet: v })}
                    unit={<img src={coinIcon} width={14} height={14} alt="King Points" />}
                    inputMode="decimal"
                  />
                </Field>
              </div>
            </section>
          )
        })}
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-actions">
        <button
          type="button"
          className="admin-button admin-button--quiet"
          onClick={() => setForm({ keno: toForm(DEFAULT_RULES.keno), coinflip: toForm(DEFAULT_RULES.coinflip) })}
        >
          Reset to defaults
        </button>
        <button type="submit" className="kk-button admin-submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save rules'}
        </button>
      </div>
    </form>
  )
}
