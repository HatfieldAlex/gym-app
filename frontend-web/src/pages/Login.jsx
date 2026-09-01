import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useDocumentTitle } from '../hooks.js'

const WRONG_CREDENTIALS = "Your username and password didn't match. Please try again."

export default function Login() {
  useDocumentTitle('Log in · Gym App')
  const { isAuthenticated, loading, logIn, username } = useAuth()
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  function update(field) {
    return (event) => setCredentials((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setErrorMessage(null)
    try {
      await logIn(credentials)
      // Where both ends of a session used to land, by way of LOGIN_REDIRECT_URL.
      navigate('/')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof ApiError && error.status === 400
          ? (error.detail ?? WRONG_CREDENTIALS)
          : 'Could not log in. Please try again.',
      )
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="status">Loading…</p>
  }

  // Landing here with a session already open deserves something better than an
  // empty form.
  if (isAuthenticated) {
    return (
      <>
        <p>You are already signed in as {username}.</p>
        <Link className="button" to="/">
          Go home
        </Link>
      </>
    )
  }

  return (
    <>
      <h1>Log in</h1>
      {errorMessage && (
        <p className="status" data-state="error">
          {errorMessage}
        </p>
      )}
      <form className="login" onSubmit={handleSubmit}>
        <p>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={credentials.username}
            onChange={update('username')}
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={credentials.password}
            onChange={update('password')}
          />
        </p>
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </>
  )
}
