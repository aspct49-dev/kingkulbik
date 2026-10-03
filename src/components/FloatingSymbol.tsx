import type { CSSProperties } from 'react'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './FloatingSymbol.css'

type FloatingSymbolProps = {
  src: string
  /** Size of the rotated image itself. */
  size: number
  /** Resting rotation from the design, in degrees. */
  rotation: number
  className?: string
  style?: CSSProperties
}

export default function FloatingSymbol({ src, size, rotation, className = '', style }: FloatingSymbolProps) {
  const { phase, handlers } = useHoverAnimation()

  return (
    <div
      className={`floating-symbol hover-anim hover-anim--${phase} ${className}`}
      style={{ ...style, '--rotation': `${rotation}deg` } as CSSProperties}
      aria-hidden
      {...handlers}
    >
      <img src={src} width={size} height={size} alt="" />
    </div>
  )
}
