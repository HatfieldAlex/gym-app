import { Link } from 'react-router-dom'

import { useDocumentTitle } from '../hooks.js'

/** Client-side routing means the app, not Django, answers for unknown paths. */
export default function NotFound() {
  useDocumentTitle('Page not found — Gym App')

  return (
    <>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <Link className="button" to="/">
        Go home
      </Link>
    </>
  )
}
