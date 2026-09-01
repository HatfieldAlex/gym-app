import { Link } from 'react-router-dom'

import { useAuth } from '../auth.jsx'
import { useDocumentTitle } from '../hooks.js'

/**
 * Gate for everything that needs a session.
 *
 * Anonymous visitors are shown the invitation to sign in rather than redirected
 * to it -- the same thing the server-rendered shell used to do, and it leaves
 * the URL they asked for intact.
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()

  // Only the signed-out shell names itself: the page below sets its own title
  // when it renders, and effects run child-first, so this must stay out of its
  // way rather than overwrite it.
  useDocumentTitle(isAuthenticated ? null : 'Gym App')

  if (loading) {
    return <p className="status">Loading…</p>
  }

  if (!isAuthenticated) {
    return (
      <>
        <p>You are not signed in.</p>
        <Link className="button" to="/login">
          Log in
        </Link>
      </>
    )
  }

  return children
}
