import { useState } from 'react'
import type { StoreItem } from '../../../shared/content'
import type { Redemption } from '../../../shared/profiles'
import { setStoreItems } from '../../hooks/useContent'
import { adminPost } from './api'

/** Deliver / reject / reopen one redemption (rejecting asks for an optional note) */
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
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const set = async (status: Redemption['status'], message: string, withNote = '') => {
    setBusy(true)
    try {
      const res = await adminPost<{ redemptions: Redemption[]; shop: StoreItem[] }>(`redemptions/${r.id}`, {
        status,
        note: withNote,
      })
      onChange(res.redemptions)
      setStoreItems(res.shop)
      notify(message)
      setRejecting(false)
      setNote('')
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
          void set('rejected', 'Redemption rejected', note.trim())
        }}
      >
        <span className="admin-input admin-input--small">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (shown to them)"
            maxLength={200}
            aria-label="Reason"
            autoFocus
          />
        </span>
        <button type="submit" className="admin-button admin-button--danger" disabled={busy}>
          Reject
        </button>
        <button type="button" className="admin-button admin-button--quiet" onClick={() => setRejecting(false)}>
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div className="admin-row__actions">
      {r.status === 'pending' ? (
        <>
          <button
            type="button"
            className="admin-button admin-button--gold"
            disabled={busy}
            onClick={() => void set('fulfilled', 'Marked as delivered')}
          >
            Delivered
          </button>
          <button type="button" className="admin-button admin-button--danger" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </>
      ) : (
        <button type="button" className="admin-button" disabled={busy} onClick={() => void set('pending', 'Back to pending')}>
          Reopen
        </button>
      )}
    </div>
  )
}
