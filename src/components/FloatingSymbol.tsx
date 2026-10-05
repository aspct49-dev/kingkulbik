import type { CSSProperties } from 'react'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './FloatingSymbol.css'

type FloatingSymbolProps = {
  src: string
  /** Size of the rotated image itself (one number for a square image) */
  size: number | { width: number; height: number }
  /** Resting rotation from the design, in degrees. */
  rotation: number
  className?: string
  style?: CSSProperties
  /** Bob gently on its own; the number offsets each symbol's rhythm (seconds) */
  idle?: number
}

export default function FloatingSymbol({ src, size, rotation, className = '', style, idle }: FloatingSymbolProps) {
  const { phase, handlers } = useHoverAnimation()

  return (
    <div
      className={`floating-symbol${idle === undefined ? '' : ' floating-symbol--idle'} hover-anim hover-anim--${phase} ${className}`}
      style={{ ...style, '--rotation': `${rotation}deg`, '--idle-delay': `${-(idle ?? 0)}s` } as CSSProperties}
      aria-hidden
      {...handlers}
    >
      {/* The idle bob runs on this inner layer: the outer element's animation drives the hover */}
      <span className="floating-symbol__bob">
        <img
          src={src}
          width={typeof size === 'number' ? size : size.width}
          height={typeof size === 'number' ? size : size.height}
          alt=""
        />
      </span>
    </div>
  )
}
