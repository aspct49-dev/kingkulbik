import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './Toast.css'

/** A short confirmation that rises from the bottom of the screen */
export function useToast(duration = 1800) {
  const [toast, setToast] = useState<{ content: ReactNode; visible: boolean }>({ content: null, visible: false })
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const show = useCallback(
    (content: ReactNode) => {
      clearTimeout(timer.current)
      setToast({ content, visible: true })
      // Keep the text while it fades out
      timer.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), duration)
    },
    [duration],
  )

  return { toast, show }
}

/** error: drops from the top with a red mark, for a bet the game turned down */
export default function Toast({ toast, tone }: { toast: { content: ReactNode; visible: boolean }; tone?: 'error' }) {
  if (tone === 'error') {
    return (
      <p className={`toast toast--error${toast.visible ? ' toast--visible' : ''}`} role="alert">
        {toast.content && (
          <svg className="toast__mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="10" fill="#e5484d" />
            <path d="M6.75 6.75l6.5 6.5M13.25 6.75l-6.5 6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {toast.content}
      </p>
    )
  }
  return (
    <p className={`toast${toast.visible ? ' toast--visible' : ''}`} role="status" aria-live="polite">
      {toast.content}
    </p>
  )
}
