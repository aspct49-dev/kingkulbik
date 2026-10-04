import { Link } from 'react-router'
import gamesIcon from '../assets/games/games-icon.svg'
import flipImg from '../assets/games/flip.png'
import kenoImg from '../assets/games/keno.png'
import dragonTowerImg from '../assets/games/dragon-tower.png'
import diceImg from '../assets/games/dice.png'
import limboImg from '../assets/games/limbo.png'
import './ExclusiveGames.css'

const games = [
  { name: 'Flip', href: '#coinflip', image: flipImg },
  { name: 'Keno', href: '/keno', image: kenoImg },
  { name: 'Dragon Tower', href: '#dragon-tower', image: dragonTowerImg },
  { name: 'Dice', href: '#dice', image: diceImg },
  { name: 'Limbo', href: '#limbo', image: limboImg },
]

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
            <Link className="exclusive-games__card" to={game.href}>
              <img src={game.image} alt={game.name} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
