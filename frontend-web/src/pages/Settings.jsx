import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

// The API answers with the stored value; these are the words for it. Falling
// back to the raw value keeps a kind added later readable rather than blank.
const KIND_LABELS = { idea: 'Idea', bug: 'Bug', other: 'Other' }

function Note({ note }) {
  return (
    <li className="note">
      <p className="note-body">{note.body}</p>
      <p className="note-meta">
        <time dateTime={note.created_at}>
          {new Date(note.created_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
        {' · '}
        {KIND_LABELS[note.kind] ?? note.kind}
        {/* page_path is blank for a note filed where the app did not know the
            screen, so it only earns a separator when there is one. */}
        {note.page_path && (
          <>
            {' · '}
            <code>{note.page_path}</code>
          </>
        )}
      </p>
    </li>
  )
}

function LoggedNotes() {
  // The API orders newest first, so nothing here sorts. Read-only throughout:
  // a note is triaged in the admin, not from this list.
  const { state, data: notes, error } = useLoad(() => api.list('feedback-notes/'))

  return (
    <section className="notes-section">
      <h2>Your notes</h2>
      <Status state={state} error={error} />

      {state === 'ready' &&
        (notes.length === 0 ? (
          <p className="status">No notes yet.</p>
        ) : (
          <ul className="notes">
            {notes.map((note) => (
              <Note key={note.id} note={note} />
            ))}
          </ul>
        ))}
    </section>
  )
}

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

      {/* Its own component, so a failed load is the section's problem and Log
          out above it keeps working. */}
      <LoggedNotes />
    </>
  )
}
