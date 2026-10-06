import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { uploadImage } from './api'

/** A labelled form control */
export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`}>
      <span className="admin-field__label">{label}</span>
      {children}
      {hint && <span className="admin-field__hint">{hint}</span>}
    </label>
  )
}

/** Text or number input in the site's field style, with an optional unit on the left */
export function Input({
  value,
  onChange,
  unit,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  unit?: ReactNode
  placeholder?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  maxLength?: number
  required?: boolean
}) {
  return (
    <span className={`admin-input${unit ? ' admin-input--unit' : ''}`}>
      {unit && <span className="admin-input__unit">{unit}</span>}
      <input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} {...rest} />
    </span>
  )
}

/** Image preview with an upload button (shrunk to WebP in the browser first) */
export function ImageField({
  value,
  onChange,
  shape,
  maxEdge,
  placeholder,
}: {
  value: string
  onChange: (url: string) => void
  shape: 'portrait' | 'square'
  maxEdge: number
  placeholder: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await uploadImage(file, maxEdge))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`admin-image admin-image--${shape}`}>
      <div className="admin-image__frame">{value ? <img src={value} alt="" /> : <span>{placeholder}</span>}</div>
      <div className="admin-image__actions">
        <button type="button" className="admin-button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </button>
        {value && (
          <button type="button" className="admin-button admin-button--quiet" disabled={busy} onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {error && <p className="admin-error">{error}</p>}
    </div>
  )
}

/** An action that asks once inline ("Delete?" Yes / No) */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  tone = 'danger',
}: {
  label: string
  confirm: string
  onConfirm: () => void
  /** danger for deletes; gold for a big but non-destructive step (locking a raffle) */
  tone?: 'danger' | 'gold'
}) {
  const [asking, setAsking] = useState(false)
  const toneClass = tone === 'gold' ? 'admin-button--gold' : 'admin-button--danger'
  if (!asking) {
    return (
      <button type="button" className={`admin-button ${toneClass}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="admin-confirm" role="group" aria-label={confirm}>
      <span className="admin-confirm__text">{confirm}</span>
      <button
        type="button"
        className={`admin-button ${toneClass}`}
        autoFocus
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        Yes
      </button>
      <button type="button" className="admin-button admin-button--quiet" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  )
}

/** On/off switch (the game settings popover's style) */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode }) {
  return (
    <label className="admin-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="admin-toggle__switch" aria-hidden />
      {label}
    </label>
  )
}

/** Number input text → number (commas allowed), or NaN */
export const num = (value: string) => Number(value.replace(/,/g, '').trim() || NaN)
