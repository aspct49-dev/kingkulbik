import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import gamesIcon from '../assets/games/games-icon.svg'
import cardBg from '../assets/games/card-bg.webp'
import kenoArt from '../assets/games/keno-art.webp'
import kenoTitle from '../assets/games/keno-title.webp'
import coinflipArt from '../assets/games/coinflip-art.webp'
import coinflipTitle from '../assets/games/coinflip-title.webp'
import bonusHuntArt from '../assets/games/bonus-hunt-art.webp'
import bonusHuntTitle from '../assets/games/bonus-hunt-title.webp'
import guessArt from '../assets/games/guess-the-balance-art.webp'
import guessTitle from '../assets/games/guess-the-balance-title.webp'
import { useHoverAnimation } from '../hooks/useHoverAnimation'
import './ExclusiveGames.css'

type Game = {
  name: string
  href: string
  art: string
  title: string
  /** Which way the art leans as it lifts on hover */
  tilt: number
}

const games: Game[] = [
  { name: 'Keno', href: '/keno', art: kenoArt, title: kenoTitle, tilt: -5 },
  { name: 'Coinflip', href: '/coinflip', art: coinflipArt, title: coinflipTitle, tilt: 6 },
  { name: 'Bonus Hunt', href: '/bonus-hunt', art: bonusHuntArt, title: bonusHuntTitle, tilt: -3 },
  { name: 'Guess the Balance', href: '/guess-the-balance', art: guessArt, title: guessTitle, tilt: 5 },
]

/** One card: shared background, the game's art (which moves on hover) and its title */
function GameCard({ name, href, art, title, tilt }: Game) {
  const { phase, handlers } = useHoverAnimation()
  return (
    <Link
      className={`exclusive-games__card hover-anim hover-anim--${phase}`}
      to={href}
      aria-label={name}
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      {...handlers}
    >
      <img className="exclusive-games__layer" src={cardBg} alt="" />
      <img className="exclusive-games__layer exclusive-games__art" src={art} alt="" />
      <img className="exclusive-games__layer" src={title} alt="" />
    </Link>
  )
}

export default function ExclusiveGames() {
  return (
    <section className="exclusive-games" id="games">
      <h2 className="exclusive-games__heading">
        <img src={gamesIcon} width={24} height={24} alt="" />
        Exclusive Games
      </h2>
      <ul className="exclusive-games__list">
        {games.map((game) => (
          <li key={game.name}>
            <GameCard {...game} />
          </li>
        ))}
      </ul>
    </section>
  )
}
