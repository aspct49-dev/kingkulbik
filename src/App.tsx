import { BrowserRouter, Route, Routes } from 'react-router'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Header className="app__header" />
        <Sidebar />
        <main className="app__main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
          </Routes>
          <Footer />
        </main>
      </div>
    </BrowserRouter>
  )
}
