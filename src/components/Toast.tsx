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

export default function Toast({ toast }: { toast: { content: ReactNode; visible: boolean } }) {
  return (
    <p className={`toast${toast.visible ? ' toast--visible' : ''}`} role="status" aria-live="polite">
      {toast.content}
    </p>
  )
}
