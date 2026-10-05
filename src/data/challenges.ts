import waylandersForge from '../assets/challenges/waylanders-forge.webp'
import sweetBonanza from '../assets/challenges/sweet-bonanza.webp'
import gatesOfOlympus from '../assets/challenges/gates-of-olympus-1000.webp'
import ganjaSnail from '../assets/challenges/ganja-snail.webp'
import odinsVault from '../assets/challenges/odins-vault.webp'
import wantedDeadOrAWild from '../assets/challenges/wanted-dead-or-a-wild.webp'
import keno from '../assets/challenges/keno.webp'
import legion from '../assets/challenges/legion.webp'

export type Challenge = {
  id: string
  game: string
  image: string
  /** Target multiplier to hit, e.g. 2500 for 2,500× */
  multiplier: number
  /** Minimum bet in USD */
  minBet: number
  /** Prize in USD */
  reward: number
}

/*
 * The challenges from the design. Static for now; these become admin-managed
 * (and claims tracked per user) once accounts land — see the platform plan.
 */
export const CHALLENGES: Challenge[] = [
  { id: 'waylanders-forge-2500', game: 'Waylanders Forge', image: waylandersForge, multiplier: 2500, minBet: 0.2, reward: 100 },
  { id: 'sweet-bonanza-750', game: 'Sweet Bonanza', image: sweetBonanza, multiplier: 750, minBet: 0.6, reward: 200 },
  { id: 'gates-of-olympus-1000-10000', game: 'Gates Of Olympus 1000', image: gatesOfOlympus, multiplier: 10000, minBet: 1, reward: 1200 },
  { id: 'ganja-snail-1500', game: 'Ganja Snail', image: ganjaSnail, multiplier: 1500, minBet: 0.1, reward: 50 },
  { id: 'waylanders-forge-20000', game: 'Waylanders Forge', image: waylandersForge, multiplier: 20000, minBet: 0.05, reward: 250 },
  { id: 'odins-vault-50000', game: 'Odin’s Vault', image: odinsVault, multiplier: 50000, minBet: 0.02, reward: 300 },
  { id: 'wanted-dead-or-a-wild-12500', game: 'Wanted Dead or Wild', image: wantedDeadOrAWild, multiplier: 12500, minBet: 0.4, reward: 750 },
  { id: 'original-keno-500', game: 'Original Keno', image: keno, multiplier: 500, minBet: 2, reward: 150 },
  { id: 'legion-5000', game: 'Legion', image: legion, multiplier: 5000, minBet: 0.1, reward: 75 },
]
