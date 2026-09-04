import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

// The API answers with the stored value; these are the words for it. Falling
// back to the raw value keeps a kind added later readable rather than blank.
const KIND_LABELS = { idea: 'Idea', bug: 'Bug', other: 'Other' }

/** One logged note, and the one act available on it.
 *
 * A display component: every piece of state lives in `LoggedNotes` and arrives
 * in one `acts` object, the way `SetRow` takes `rows` — because arming one has to
 * disarm every other, and one act at a time disables all of them.
 *
 * Open notes carry ×, closed ones ↺, never both. Closing arms on the first tap
 * and goes through on the second (C9); reopening is one tap, because it puts
 * back exactly what was there and breaks nothing.
 */
function Note({ note, acts }) {
  const closed = note.resolved_at !== null
  const armed = acts.armed === note.id
  const failure = acts.failure?.note === note.id ? acts.failure.message : null

  return (
    // The styling hook for a closed note, which chunk 04 hangs its treatment on.
    <li className="note" data-closed={closed ? '' : undefined}>
      <div className="note-text">
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
          {/* The flag, said as a word and last in the run. Not *when* it was
              closed: the line already carries one date, and resolved_at is a
              state being shown rather than a history being told. */}
          {closed && (
            <>
              {' · '}
              {/* Its own element only so the word can hold its weight while the
                  body around it recedes — the styling hook, not a change of
                  wording. */}
              <span className="note-closed">Closed</span>
            </>
          )}
        </p>
      </div>

      {closed ? (
        <button
          className="note-action"
          type="button"
          aria-label="Reopen this note"
          onClick={() => acts.reopen(note)}
          disabled={acts.busy}
        >
          ↺
        </button>
      ) : (
        // Tabbing away is moving away too; the pointer half of it is the
        // listener in LoggedNotes, which sees taps that land on nothing
        // focusable. The label carries what the glyph cannot say out loud.
        <button
          className="note-action"
          data-armed={armed ? '' : undefined}
          type="button"
          aria-label={armed ? 'Close this note — tap again to confirm' : 'Close this note'}
          onClick={() => acts.close(note)}
          onBlur={() => acts.disarm(note.id)}
          disabled={acts.busy}
        >
          {armed ? 'Sure?' : '×'}
        </button>
      )}

      {/* On the note it happened to, which is still sitting there exactly as it
          was: a note changes when the server has answered, not when it was
          asked (C8). */}
      {failure && (
        <p className="status" data-state="error">
          {failure}
        </p>
      )}
    </li>
  )
}

function LoggedNotes() {
  // Every note, open and closed, newest first, in one request with no query
  // parameter (C6): which of them is on screen is this section's business, and
  // nothing here ever re-sorts what came back.
  const { state, data, error } = useLoad(() => api.list('feedback-notes/'))

  // The loaded list becomes the section's own state (C7), the move
  // CurrentSession makes with `session`: `useLoad` returns no setter, and
  // re-running it to pick up a change would blank the whole section back to
  // "Loading…" on every tap. No second `loaded` flag: nothing here redirects on
  // the render between the two.
  const [notes, setNotes] = useState(null)
  useEffect(() => {
    if (state === 'ready') setNotes(data)
  }, [state, data])

  // Open is what the list is for, so open is what it shows. The toggle lives as
  // long as this page does and is remembered nowhere — not in localStorage, not
  // in the URL — so a reload always comes back to open-only (C11).
  const [showClosed, setShowClosed] = useState(false)

  // Which note is armed, whether an act is in flight, and the one failure
  // worth showing — all of it the section's, as `useSetRows` holds it for the
  // set rows.
  const [armed, setArmed] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  // Acting elsewhere disarms a close, and on a touch screen most of "elsewhere"
  // is not focusable, so no blur reports it. While a note is armed, the next
  // pointer down anywhere but that button puts the safety back on — including
  // the second tap of a *different* note's ×, which then only arms it.
  useEffect(() => {
    if (armed === null) return undefined

    function disarmElsewhere(event) {
      if (!event.target.closest?.('[data-armed]')) setArmed(null)
    }
    document.addEventListener('pointerdown', disarmElsewhere)
    return () => document.removeEventListener('pointerdown', disarmElsewhere)
  }, [armed])

  /** The server's answer replaces that one note, in place. Nothing is removed
   *  from the list and nothing is re-sorted (C5, C10). */
  function replace(saved) {
    setNotes((current) => current.map((note) => (note.id === saved.id ? saved : note)))
  }

  /** First tap arms this note, second tap closes it. */
  async function close(note) {
    if (armed !== note.id) {
      setArmed(note.id)
      setFailure(null)
      return
    }
    if (busy) return

    setBusy(true)
    setFailure(null)
    try {
      replace(await api.post(`feedback-notes/${note.id}/close/`))
      setArmed(null)
    } catch (failed) {
      console.error(failed)
      // The note stays open and armed, so a retry is the next tap.
      setFailure({ note: note.id, message: 'Could not close that note. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  /** One tap, no arming: reopening puts back exactly what was there (C9). */
  async function reopen(note) {
    if (busy) return

    setBusy(true)
    setFailure(null)
    try {
      replace(await api.post(`feedback-notes/${note.id}/reopen/`))
      setArmed(null)
    } catch (failed) {
      console.error(failed)
      setFailure({ note: note.id, message: 'Could not reopen that note. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  function disarm(id) {
    setArmed((current) => (current === id ? null : current))
  }

  const acts = { armed, busy, failure, close, reopen, disarm }

  // Filtered, never sorted: every note is already in memory (C6), and one
  // un-hidden comes back in the place it always had rather than in a section of
  // its own (C10).
  const visible =
    notes === null || showClosed ? notes : notes.filter((note) => note.resolved_at === null)

  // A control that reveals nothing is furniture, so the toggle arrives with the
  // first closed note (C11) — including the one closed a row below it, which is
  // the answer to "where did it go".
  const hasClosed = notes !== null && notes.some((note) => note.resolved_at !== null)

  return (
    <section className="notes-section">
      <h2>Your notes</h2>
      <Status state={state} error={error} />

      {/* Gated on the section's own copy rather than on `state`: the list is
          rendered from what this section knows, which is the load plus every
          answer since. */}
      {notes !== null && (
        <>
          {/* Above the list, so appearing on the tap that closed a note moves
              nothing under the thumb that just tapped. */}
          {hasClosed && (
            <button
              className="notes-toggle"
              type="button"
              aria-pressed={showClosed}
              onClick={() => setShowClosed((showing) => !showing)}
            >
              {showClosed ? 'Hide closed' : 'Show closed'}
            </button>
          )}

          {/* Two ways to be empty, and neither is a congratulation: nothing was
              ever written, or nothing is outstanding. Showing closed with none
              to show cannot happen — the toggle would not be there. */}
          {notes.length === 0 ? (
            <p className="status">No notes yet.</p>
          ) : visible.length === 0 ? (
            <p className="status">Nothing open.</p>
          ) : (
            <ul className="notes">
              {visible.map((note) => (
                <Note key={note.id} note={note} acts={acts} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function ExportSection() {
  // Its own busy/failed, like LoggedNotes' own load: a failed download leaves
  // Log out above and the notes below untouched.
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleDownload() {
    setBusy(true)
    setFailed(false)
    try {
      const { blob, filename } = await api.download('export/')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      // The anchor is in the document before it is clicked (Firefox ignores a
      // click on a detached one), and the object URL is revoked on the next
      // tick rather than immediately (Safari cancels a save whose URL goes in
      // the same task).
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      console.error(error)
      setFailed(true)
    } finally {
      // Unlike Log out, this page is still standing afterwards.
      setBusy(false)
    }
  }

  return (
    <section className="export-section">
      <h2>Download your data</h2>
      <p className="export-summary">
        A zip of everything you can see in the app: one CSV per table, and{' '}
        <code>workouts.csv</code> with a row for every set you have logged.
      </p>
      <button
        className="button button--tap"
        type="button"
        onClick={handleDownload}
        disabled={busy}
      >
        {busy ? 'Preparing…' : 'Download'}
      </button>
      {failed && (
        <p className="status" data-state="error">
          Could not prepare your download. Please try again.
        </p>
      )}
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

      {/* An account action belongs with the other account action, and the
          list of notes reads last. */}
      <ExportSection />

      {/* Its own component, so a failed load is the section's problem and Log
          out above it keeps working. */}
      <LoggedNotes />
    </>
  )
}
