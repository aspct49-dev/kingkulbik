import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import KenoPage from './pages/KenoPage'

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
