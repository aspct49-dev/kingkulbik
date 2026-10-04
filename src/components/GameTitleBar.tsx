import './GameTitleBar.css'

type GameTitleBarProps = {
  name: string
  icon: string
  /** Return to player, 0–1 */
  rtp: number
  /** Match the game panel's theatre-mode width */
  wide?: boolean
}

/** The strip under each game: name, the "King Kulbik Originals" tag and the RTP */
export default function GameTitleBar({ name, icon, rtp, wide }: GameTitleBarProps) {
  return (
    <div className={`game-titlebar${wide ? ' game-titlebar--wide' : ''}`}>
      <span className="game-titlebar__name">
        <img src={icon} width={16} height={16} alt="" />
        {name}
      </span>
      <span className="game-titlebar__tag">King Kulbik Originals</span>
      <span className="game-titlebar__rtp">RTP {(rtp * 100).toFixed(0)}%</span>
    </div>
  )
}
