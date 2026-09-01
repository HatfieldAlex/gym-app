import { Route, Routes } from 'react-router-dom'

import { useAuth } from './auth.jsx'
import Nav from './components/Nav.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import ExerciseCatalogue from './pages/ExerciseCatalogue.jsx'
import ExerciseDetail from './pages/ExerciseDetail.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import NotFound from './pages/NotFound.jsx'
import Settings from './pages/Settings.jsx'
import TrainingSessions from './pages/TrainingSessions.jsx'

/** Everything but the login page needs a session; wrap it once, here. */
function Private({ children }) {
  return <RequireAuth>{children}</RequireAuth>
}

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated && <Nav />}
      <main>
        <Routes>
          <Route path="/" element={<Private><Home /></Private>} />
          <Route
            path="/exercises-catelog"
            element={<Private><ExerciseCatalogue /></Private>}
          />
          <Route
            path="/exercises-catelog/:exerciseId"
            element={<Private><ExerciseDetail /></Private>}
          />
          <Route
            path="/training-sessions"
            element={<Private><TrainingSessions /></Private>}
          />
          <Route path="/settings" element={<Private><Settings /></Private>} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
