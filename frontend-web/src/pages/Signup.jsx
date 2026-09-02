import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useDocumentTitle } from '../hooks.js'

const REJECTED = 'Could not create that account. Please try a different username.'

export default function Signup() {
  useDocumentTitle('Sign up · Gym App')
  const { isAuthenticated, loading, signUp, username } = useAuth()
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
      await signUp(credentials)
      // Signing up leaves the new account signed in, so this lands where a
      // successful login lands rather than back at the login form.
      navigate('/')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        // A 400 here is a taken username or a blank field, and DRF says which;
        // anything else is not the form's fault and gets the generic line.
        error instanceof ApiError && error.status === 400
          ? (error.detail ?? REJECTED)
          : 'Could not sign up. Please try again.',
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
      <h1>Sign up</h1>
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
            autoComplete="new-password"
            required
            value={credentials.password}
            onChange={update('password')}
          />
        </p>
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>.
      </p>
    </>
  )
}
