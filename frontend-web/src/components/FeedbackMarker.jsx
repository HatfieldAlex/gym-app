import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { api, ApiError } from '../api.js'

const PANEL_ID = 'feedback-panel'
const BODY_ID = 'feedback-body'
// Long enough to read, short enough that nobody waits for it.
const LOGGED_MS = 1500
// One tap, never a required one: the row opens on Idea and sending without
// touching it is the ordinary way to use the panel (B10).
const KINDS = [
  { value: 'idea', label: 'Idea' },
  { value: 'bug', label: 'Bug' },
  { value: 'other', label: 'Other' },
]
const DEFAULT_KIND = 'idea'
// The column's own limit. No route in this app comes close, but a stray long
// path must not be the reason a note is refused.
const PATH_MAX = 200

function messageFor(error) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired. Please log in again.'
    }
    if (error.detail) {
      return error.detail
    }
  }
  return 'Could not log that. Try again.'
}

/**
 * The way in and the way out of the note panel, at the end of the top row.
 *
 * It lives in the nav rather than in a page, and opens no route: the page
 * underneath keeps its scroll, its state and its place in history, and the
 * panel survives navigation because the nav is rendered outside the routes.
 *
 * The draft is held here rather than in the panel, which unmounts every time it
 * closes: a half-written sentence outlives closing, reopening and navigating,
 * and goes only when the note has actually landed (B6).
 */
export default function FeedbackMarker() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [kind, setKind] = useState(DEFAULT_KIND)
  const [path, setPath] = useState('')
  const location = useLocation()
  const rootRef = useRef(null)
  const markerRef = useRef(null)
  const panelRef = useRef(null)
  const bodyRef = useRef(null)
  const kindRef = useRef(null)
  // Bumped on every close, so a reply that arrives after the panel has gone
  // cannot start the "Logged." beat in a panel nobody is looking at.
  const openingRef = useRef(0)

  // The path belongs to the note, not to the opening. It is read once, when a
  // note begins, and never again while that note is alive: a draft outlives
  // closing, reopening and navigating (B6), so a thought that arrived on the
  // current session is still about the current session when it is sent two
  // pages later. Only a landed note lets the next open take a fresh one.
  // Cut to the column on the way in, so what the panel shows is what is sent.
  function reveal() {
    if (!draft.trim()) {
      setPath(location.pathname.slice(0, PATH_MAX))
    }
    setOpen(true)
  }

  // Focus goes back to the marker only when the panel was holding it. A click
  // outside has already put focus where the user aimed it, and taking it back
  // would undo their tap. `preventScroll` for the same reason as on the way in:
  // the marker is at the top of the document, and a page scrolled down to the
  // set being logged must not jump back up when the panel leaves.
  function dismiss() {
    const held = panelRef.current?.contains(document.activeElement)
    openingRef.current += 1
    setOpen(false)
    setSent(false)
    if (held) {
      markerRef.current?.focus({ preventScroll: true })
    }
  }

  async function send() {
    const sending = draft
    const body = sending.trim()
    // Send is disabled in both these cases; the guard is for Ctrl+Enter, which
    // does not go through the button.
    if (!body || busy) {
      return
    }
    const opening = openingRef.current
    setBusy(true)
    setError(null)
    try {
      await api.post('feedback-notes/', { body, kind, page_path: path })
      // What landed is cleared; the box stays editable in flight, so anything
      // typed after the send began has not been logged and is not ours to eat.
      setDraft((current) => (current === sending ? '' : current))
      // Only a landed note resets the row; a failure leaves the choice in
      // place, so the retry sends what was meant.
      setKind(DEFAULT_KIND)
      if (openingRef.current === opening) {
        setSent(true)
      }
    } catch (caught) {
      console.error(caught)
      setError(messageFor(caught))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handleKeyDown(event) {
      // An IME closes its own candidate list with Escape; that keystroke is
      // the composer's, not the panel's.
      if (event.key === 'Escape' && !event.isComposing) {
        dismiss()
      }
    }

    // Capture, so a page that stops its own clicks from bubbling cannot leave
    // the panel stuck open. Nothing is cancelled here, so the click still does
    // whatever it was going to do -- a tap on a nav link closes this and
    // navigates.
    function handleClick(event) {
      if (!rootRef.current?.contains(event.target)) {
        dismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClick, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    // Somewhere to land that is not the top of the document, without trapping
    // anything: Tab still walks out of the panel and on down the page. The box
    // is why the panel was opened, so the cursor starts in it.
    // `preventScroll`, because focus scrolls its target into view by default and
    // the one thing this panel must never do is move the page under the reader.
    const box = bodyRef.current
    ;(box ?? panelRef.current)?.focus({ preventScroll: true })
    // Reopening the panel is reopening a half-written sentence (B6), and
    // focusing a textarea leaves the caret before its first character: without
    // this, carrying on typing would type into the front of the draft.
    box?.setSelectionRange(box.value.length, box.value.length)
  }, [open])

  // The success beat. The four dismissals still work through it and close the
  // panel at once; the cleanup drops the timer when they do, and when the nav
  // itself goes on logging out.
  useEffect(() => {
    if (!open || !sent) {
      return undefined
    }
    // The textarea that had focus has just gone; keep it in the panel so
    // Escape still counts as the panel's, and so closing hands it back.
    panelRef.current?.focus({ preventScroll: true })
    const timer = setTimeout(dismiss, LOGGED_MS)
    return () => clearTimeout(timer)
  }, [open, sent])

  function handleDraftChange(event) {
    setDraft(event.target.value)
    // A retry should not have to argue with the message from the last one.
    setError(null)
  }

  // The arrow keys are what a radio group answers to; the row is rendered from
  // buttons, so they are answered here.
  function handleKindKeyDown(event) {
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const on = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    if (!back && !on) {
      return
    }
    // Or the page scrolls under the panel, which is the one thing it must not do.
    event.preventDefault()
    const at = KINDS.findIndex((option) => option.value === kind)
    const next = KINDS[(at + (back ? KINDS.length - 1 : 1)) % KINDS.length].value
    setKind(next)
    kindRef.current
      ?.querySelector(`[data-kind="${next}"]`)
      ?.focus({ preventScroll: true })
  }

  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      // A bare Enter stays a newline; this one is the send.
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="feedback" ref={rootRef}>
      <button
        type="button"
        className="feedback-marker"
        ref={markerRef}
        onClick={() => (open ? dismiss() : reveal())}
        aria-label="Log an idea or a bug"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        title="Log an idea or a bug"
      >
        💡
      </button>
      {open && (
        <div
          className="feedback-panel"
          id={PANEL_ID}
          ref={panelRef}
          role="dialog"
          aria-label="Log a note"
          tabIndex={-1}
        >
          <h2>Log a note</h2>
          {/* Information, not a field: it is here so nobody types "on the
              current session page", and there is nothing to fill in or fix. */}
          {!sent && path && <p className="status feedback-path">on {path}</p>}
          {sent ? (
            <p className="status" role="status">
              Logged.
            </p>
          ) : (
            <>
              {/* The heading has already said it; the label is here for the
                  box's name, not for the eye. */}
              <label className="feedback-label" htmlFor={BODY_ID}>
                Your note
              </label>
              <textarea
                id={BODY_ID}
                className="feedback-body"
                ref={bodyRef}
                rows={4}
                value={draft}
                placeholder="What happened, or what would be better?"
                onChange={handleDraftChange}
                onKeyDown={handleDraftKeyDown}
              />
              {/* A radio group by hand rather than radio inputs: a tap must
                  not pull the cursor out of the box, and the only way to stop
                  that is to cancel the mousedown that moves focus -- which a
                  <label> undoes again by forwarding the click to its input. */}
              <div className="feedback-kind" ref={kindRef} role="radiogroup" aria-label="Kind">
                {KINDS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    data-kind={value}
                    aria-checked={kind === value}
                    // Roving: the row is one Tab stop, and it is the chosen
                    // option that holds it.
                    tabIndex={kind === value ? 0 : -1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setKind(value)}
                    onKeyDown={handleKindKeyDown}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {error && (
                <p className="status" data-state="error">
                  {error}
                </p>
              )}
            </>
          )}
          {/* Close first, so the row reads and tabs in the order it is drawn:
              Send is the one at the right-hand end, under the thumb that has
              just finished typing. */}
          <div className="feedback-actions">
            <button
              type="button"
              className="button button--tap feedback-close"
              onClick={dismiss}
            >
              Close
            </button>
            {!sent && (
              <button
                type="button"
                className="button button--tap"
                onClick={send}
                disabled={busy || !draft.trim()}
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
