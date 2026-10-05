import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import KenoPage from './pages/KenoPage'
import ComingSoonPage from './pages/ComingSoonPage'
import ChallengesPage from './pages/ChallengesPage'
import ItemStorePage from './pages/ItemStorePage'
import ReferralPage from './pages/ReferralPage'
import RewardsPage from './pages/RewardsPage'
import bonusHuntArt from './assets/games/bonus-hunt-art.webp'
import guessTheBalanceArt from './assets/games/guess-the-balance-art.webp'

// Loaded on demand: keeps three.js and the 3D coin out of every other page
const CoinflipPage = lazy(() => import('./pages/CoinflipPage'))

function Layout() {
  // Mobile navigation drawer (the sidebar is always visible on desktop)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app">
      <Header className="app__header" menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="app__main">
        <div className="page-transition" key={pathname}>
          <Suspense fallback={<div className="page-loading" aria-label="Loading" />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/keno" element={<KenoPage />} />
              <Route path="/coinflip" element={<CoinflipPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/challenges" element={<ChallengesPage />} />
              <Route path="/item-store" element={<ItemStorePage />} />
              <Route path="/referral" element={<ReferralPage />} />
              <Route
                path="/bonus-hunt"
                element={
                  <ComingSoonPage
                    title="Bonus Hunt"
                    art={bonusHuntArt}
                    artBox={[0.085, 0.185, 0.83, 0.43]}
                    softEdges
                    blurb="Follow every bonus from the stream as it's opened, with live totals and results. Catch the launch live on Kick."
                  />
                }
              />
              <Route
                path="/guess-the-balance"
                element={
                  <ComingSoonPage
                    title="Guess the Balance"
                    art={guessTheBalanceArt}
                    artBox={[0.07, 0.115, 0.81, 0.53]}
                    blurb="Call where the bonus hunt ends and win when you're closest. Catch the launch live on Kick."
                  />
                }
              />
            </Routes>
          </Suspense>
        </div>
        <Footer />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
