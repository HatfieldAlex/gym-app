import { ApiError } from '../api.js'

/**
 * The one place a page says that it is waiting, or that it failed.
 *
 * Renders nothing once the data is in, so a page can drop it straight into its
 * markup next to the content it is waiting for.
 */
export default function Status({ state, error }) {
  if (state === 'loading') {
    return <p className="status">Loading…</p>
  }
  if (state !== 'error') {
    return null
  }

  const expired = error instanceof ApiError && (error.status === 401 || error.status === 403)
  return (
    <p className="status" data-state="error">
      {expired
        ? 'Your session has expired. Please log in again.'
        : 'Could not load this page. Please try again.'}
    </p>
  )
}
