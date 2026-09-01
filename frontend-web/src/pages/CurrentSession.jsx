import { useDocumentTitle } from '../hooks.js'

/** The session being trained right now. A placeholder until the API grows an
    endpoint for the in-progress session; the route exists so the tab and its
    link can settle first. */
export default function CurrentSession() {
  useDocumentTitle('Current session — Gym App')

  return (
    <>
      <h1>Current session</h1>
      <p>No session in progress.</p>
    </>
  )
}
