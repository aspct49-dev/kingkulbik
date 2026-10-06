import { useState } from 'react'
import type { StoreItem } from '../../../shared/content'
import type { Redemption } from '../../../shared/profiles'
import { setStoreItems } from '../../hooks/useContent'
import { adminPost } from './api'

/**
 * Approve or reject one pending request. The points were taken when the
 * player bought it: approving just marks it delivered; rejecting refunds the
 * points in BotRix and returns the stock (the reason is shown to the player).
 */
export default function RedemptionActions({
  redemption: r,
  onChange,
  notify,
}: {
  redemption: Redemption
  onChange: (redemptions: Redemption[]) => void
  notify: (message: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (r.status !== 'pending') return null

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true)
    try {
      const res = await adminPost<{ redemptions: Redemption[]; shop: StoreItem[] }>(`redemptions/${r.id}`, {
        action,
        reason: reason.trim(),
      })
      onChange(res.redemptions)
      setStoreItems(res.shop)
      notify(
        action === 'approve'
          ? `Approved: ${r.itemName} for ${r.player}`
          : r.charged
            ? `Rejected and refunded ${r.price.toLocaleString('en-US')} King Points`
            : 'Rejected',
      )
      setRejecting(false)
      setReason('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  if (rejecting) {
    return (
      <form
        className="admin-row__actions"
        onSubmit={(e) => {
          e.preventDefault()
          void decide('reject')
        }}
      >
        <span className="admin-input admin-input--small">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (shown to them)"
            maxLength={200}
            aria-label="Reason"
            autoFocus
          />
        </span>
        <button type="submit" className="admin-button admin-button--danger" disabled={busy}>
          {busy ? 'Refunding…' : r.charged ? 'Reject & refund' : 'Reject'}
        </button>
        <button type="button" className="admin-button admin-button--quiet" disabled={busy} onClick={() => setRejecting(false)}>
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div className="admin-row__actions">
      <button type="button" className="admin-button admin-button--gold" disabled={busy} onClick={() => void decide('approve')}>
        Approve
      </button>
      <button type="button" className="admin-button admin-button--danger" disabled={busy} onClick={() => setRejecting(true)}>
        Reject
      </button>
    </div>
  )
}
