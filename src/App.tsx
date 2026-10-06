import { Suspense, lazy, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import KenoPage from './pages/KenoPage'
import ChallengesPage from './pages/ChallengesPage'
import ItemStorePage, { StoreHeroArt } from './pages/ItemStorePage'
import ComingSoonPage from './pages/ComingSoonPage'
import bonusHuntArt from './assets/games/bonus-hunt-art.webp'
import { useAuth } from './hooks/useAuth'
import ReferralPage from './pages/ReferralPage'
import RewardsPage from './pages/RewardsPage'
import AccountPage from './pages/AccountPage'
import NotFoundPage from './pages/NotFoundPage'

// Loaded on demand: keeps three.js and the 3D coin out of every other page
const CoinflipPage = lazy(() => import('./pages/CoinflipPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const BonusHuntPage = lazy(() => import('./pages/BonusHuntPage'))
const GuessTheBalancePage = lazy(() => import('./pages/GuessTheBalancePage'))
const TournamentsPage = lazy(() => import('./pages/TournamentsPage'))
const RafflesPage = lazy(() => import('./pages/RafflesPage'))
const OverlayPage = lazy(() => import('./pages/OverlayPage'))
const RafflePreviewPage = lazy(() => import('./pages/RafflePreviewPage'))

/** Browser tab title per page */
const TITLES: Record<string, string> = {
  '/': 'King Kulbik',
  '/leaderboard': 'Leaderboard',
  '/rewards': 'Rewards',
  '/challenges': 'Challenges',
  '/raffles': 'Raffles',
  '/item-store': 'Item Store',
  '/referral': '$1,000 Referral',
  '/account': 'Your Account',
  '/admin': 'Admin Panel',
  '/bonus-hunt': 'Bonus Hunt',
  '/guess-the-balance': 'Guess the Balance',
  '/tournaments': 'Tournaments',
  '/coinflip': 'Coinflip',
  '/keno': 'Keno',
}

/**
 * A section that's built but not launched: players see Coming Soon, admins
 * see the real page (with a note) so it can be tried before launch. Remove the
 * wrapper from a route to launch it.
 */
function SoonForPlayers({ page, soon }: { page: ReactNode; soon: ReactNode }) {
  const { status, admin } = useAuth()
  if (status === 'loading') return <div className="page-loading" aria-label="Loading" />
  if (!admin) return soon
  return (
    <>
      <p className="admin-preview-note">Coming Soon for players. You see the page because you're an admin.</p>
      {page}
    </>
  )
}

function Layout() {
  // Mobile navigation drawer (the sidebar is always visible on desktop)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
    const title = TITLES[pathname] ?? 'Page not found'
    document.title = pathname === '/' ? title : `${title} | King Kulbik`
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
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/challenges" element={<ChallengesPage />} />
              <Route path="/raffles" element={<RafflesPage />} />
              {/* Tuning the 3D render without a live raffle (not in production builds) */}
              {import.meta.env.DEV && <Route path="/raffle-preview" element={<RafflePreviewPage />} />}
              <Route
                path="/item-store"
                element={
                  <SoonForPlayers
                    page={<ItemStorePage />}
                    soon={
                      <ComingSoonPage
                        title="Item Store"
                        artNode={<StoreHeroArt />}
                        blurb="Spend your King Points on rewards from the stream. Catch the launch live on Kick."
                      />
                    }
                  />
                }
              />
              <Route path="/referral" element={<ReferralPage />} />
              <Route
                path="/bonus-hunt"
                element={
                  <SoonForPlayers
                    page={<BonusHuntPage />}
                    soon={
                      <ComingSoonPage
                        title="Bonus Hunt"
                        art={bonusHuntArt}
                        artBox={[0.085, 0.185, 0.83, 0.43]}
                        softEdges
                        blurb="Follow every bonus from the stream as it's opened, with live totals and results. Catch the launch live on Kick."
                      />
                    }
                  />
                }
              />
              <Route path="/guess-the-balance" element={<GuessTheBalancePage />} />
              <Route path="/tournaments" element={<TournamentsPage />} />
              <Route path="*" element={<NotFoundPage />} />
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
      <Routes>
        {/* Stream overlays (OBS browser sources): no site chrome */}
        <Route
          path="/overlay/:kind"
          element={
            <Suspense fallback={null}>
              <OverlayPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Layout />} />
      </Routes>
    </BrowserRouter>
  )
}
