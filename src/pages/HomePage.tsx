import HeroBanner from '../components/HeroBanner'
import FeatureCards from '../components/FeatureCards'
import ExclusiveGames from '../components/ExclusiveGames'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      <HeroBanner />
      <FeatureCards />
      <ExclusiveGames />
    </div>
  )
}
