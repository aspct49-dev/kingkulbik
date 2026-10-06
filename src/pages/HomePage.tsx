import HeroBanner from '../components/HeroBanner'
import FeatureCards from '../components/FeatureCards'
import ExclusiveGames from '../components/ExclusiveGames'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      <h1 className="visually-hidden">King Kulbik: Stake leaderboard, rewards and exclusive games under code KINGKULBIK</h1>
      <HeroBanner />
      <FeatureCards />
      <ExclusiveGames />
    </div>
  )
}
