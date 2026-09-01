import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth.jsx'
import { useDocumentTitle } from '../hooks.js'

export default function Settings() {
  useDocumentTitle('Settings — Gym App')
  const { logOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // The only account action so far. It stays a POST rather than a link so a
  // prefetch or a stray GET cannot end someone's session.
  async function handleLogOut() {
    setBusy(true)
    setFailed(false)
    try {
      await logOut()
      navigate('/')
    } catch (error) {
      console.error(error)
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <button className="button" type="button" onClick={handleLogOut} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
      {failed && (
        <p className="status" data-state="error">
          Could not log out. Please try again.
        </p>
      )}
    </>
  )
}
