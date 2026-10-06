import { useEffect, useState } from 'react'
import { RedemptionList } from '../../components/profile/ProfileSections'
import type { Redemption, ShopSettings } from '../../../shared/profiles'
import { adminPost } from './api'
import RedemptionActions from './RedemptionActions'
import { Input } from './ui'

type Filter = 'pending' | 'all'

/** Item Store requests: points are taken at purchase; approve once delivered, or reject to refund */
export default function RedemptionsAdmin({
  onOpenPlayer,
  onPending,
  notify,
}: {
  onOpenPlayer: (id: string) => void
  /** Keeps the nav's pending count in step */
  onPending: (count: number) => void
  notify: (message: string) => void
}) {
  const [all, setAll] = useState<Redemption[] | null>(null)
  const [filter, setFilter] = useState<Filter>('pending')
  const [failed, setFailed] = useState(false)
  const [cooldown, setCooldown] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/redemptions', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { redemptions: Redemption[] }) => setAll(body.redemptions))
      .catch(() => setFailed(true))
    fetch('/api/admin/shop-settings', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { settings: ShopSettings }) => setCooldown(String(body.settings.cooldownDays)))
      .catch(() => undefined)
  }, [])

  const saveCooldown = async () => {
    try {
      const res = await adminPost<{ settings: ShopSettings }>('shop-settings', { cooldownDays: Number(cooldown) })
      setCooldown(String(res.settings.cooldownDays))
      notify(res.settings.cooldownDays ? `One purchase every ${res.settings.cooldownDays} days` : 'No limit between purchases')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  useEffect(() => {
    if (all) onPending(all.filter((r) => r.status === 'pending').length)
  }, [all, onPending])

  const shown = (all ?? []).filter((r) => filter === 'all' || r.status === 'pending')

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        The King Points come off in BotRix the moment a player buys. Send the item, then approve it. Rejecting gives
        the points back and returns the item to stock; players can also cancel their own pending requests.
      </p>
      <section className="admin-card">
        <div className="admin-actions admin-actions--split">
          <div>
            <h2 className="admin-card__title">Purchase limit</h2>
            <p className="admin-note">Days a player waits between purchases (0 for no limit). Rejected and cancelled ones don’t count; admins aren’t limited.</p>
          </div>
          <form
            className="admin-row__actions"
            onSubmit={(e) => {
              e.preventDefault()
              void saveCooldown()
            }}
          >
            <span className="admin-short-field">
              <Input value={cooldown ?? ''} onChange={(v) => setCooldown(v.replace(/\D/g, ''))} inputMode="numeric" />
            </span>
            <span className="admin-note">days</span>
            <button type="submit" className="admin-button" disabled={cooldown === null}>
              Save
            </button>
          </form>
        </div>
      </section>
      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">
            Redemptions{' '}
            {all && <span className="admin-count">{all.filter((r) => r.status === 'pending').length} pending</span>}
          </h2>
          <div className="kk-tabs admin-filter" role="radiogroup" aria-label="Show">
            {(['pending', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                className={`kk-tab${filter === f ? ' kk-tab--selected' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'pending' ? 'Pending' : 'All'}
              </button>
            ))}
          </div>
        </div>
        {failed ? (
          <p className="admin-error">Couldn't load redemptions.</p>
        ) : !all ? (
          <p className="admin-empty">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="admin-empty">{filter === 'pending' ? 'Nothing waiting. All caught up.' : 'No redemptions yet.'}</p>
        ) : (
          <RedemptionList
            redemptions={shown}
            actions={(r) => (
              <>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => onOpenPlayer(r.userId)}>
                  Player
                </button>
                <RedemptionActions redemption={r} onChange={setAll} notify={notify} />
              </>
            )}
          />
        )}
      </section>
    </div>
  )
}
