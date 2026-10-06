import { useEffect, useState } from 'react'
import { RedemptionList } from '../../components/profile/ProfileSections'
import type { Redemption } from '../../../shared/profiles'
import RedemptionActions from './RedemptionActions'

type Filter = 'pending' | 'all'

/** Item Store requests: take the points off in BotRix, deliver, then mark it here */
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

  useEffect(() => {
    fetch('/api/admin/redemptions', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { redemptions: Redemption[] }) => setAll(body.redemptions))
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (all) onPending(all.filter((r) => r.status === 'pending').length)
  }, [all, onPending])

  const shown = (all ?? []).filter((r) => filter === 'all' || r.status === 'pending')

  return (
    <div className="admin-stack">
      <p className="admin-intro">
        Players request items with their King Points. Take the points off their Kick name in BotRix, send the item,
        then mark it delivered. Rejecting puts the item back in stock.
      </p>
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
