import { useEffect, useRef, useState } from 'react'
import clipboardIcon from '../assets/leaderboard/clipboard.svg'
import { AFFILIATE_CODE } from '../data/leaderboard'
import Toast, { useToast } from './Toast'
import './CopyCodeButton.css'

/** Clipboard API where allowed, else the old hidden-textarea copy (e.g. on plain http) */
function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      if (document.execCommand('copy')) resolve()
      else reject(new Error('copy refused'))
    } catch (err) {
      reject(err)
    } finally {
      area.remove()
    }
  })
}

/**
 * "Code: Kingkulbik". Clicking copies it: the button keeps its label, lights a
 * gold ring for a moment, and a toast confirms (as on the Rekoj site).
 * Size it with `className`.
 */
export default function CopyCodeButton({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  const { toast, show } = useToast()

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    copyText(AFFILIATE_CODE).then(
      () => {
        clearTimeout(timer.current)
        setCopied(true)
        timer.current = window.setTimeout(() => setCopied(false), 1200)
        show(
          <>
            Code <span className="toast__accent">{AFFILIATE_CODE}</span> copied to clipboard
          </>,
        )
      },
      () =>
        show(
          <>
            Couldn't copy. The code is <span className="toast__accent">{AFFILIATE_CODE}</span>
          </>,
        ),
    )
  }

  return (
    <>
      <button
        type="button"
        className={`copy-code${copied ? ' copy-code--copied' : ''} ${className}`}
        onClick={copy}
        aria-label={`Copy code ${AFFILIATE_CODE}`}
      >
        <img src={clipboardIcon} width={17.0974} height={17.9511} alt="" />
        <span>
          Code: <span className="copy-code__code">{AFFILIATE_CODE}</span>
        </span>
      </button>
      <Toast toast={toast} />
    </>
  )
}
