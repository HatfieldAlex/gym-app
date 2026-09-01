import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api } from './api.js'

/**
 * Who is signed in, for the whole app.
 *
 * Django owns the session; this only mirrors it. The first fetch also plants
 * the CSRF cookie, so it has to finish before anything can be written.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get('auth/session/')
      .then((session) => {
        if (!cancelled) setUsername(session.username)
      })
      // A session check that cannot reach the server is the same, to the app,
      // as not being signed in: the pages below will fail their own fetches and
      // say so in their own status line.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const logIn = useCallback(async (credentials) => {
    const session = await api.post('auth/login/', credentials)
    setUsername(session.username)
  }, [])

  const logOut = useCallback(async () => {
    await api.post('auth/logout/')
    setUsername(null)
  }, [])

  const value = useMemo(
    () => ({ username, isAuthenticated: username !== null, loading, logIn, logOut }),
    [username, loading, logIn, logOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>')
  }
  return context
}
