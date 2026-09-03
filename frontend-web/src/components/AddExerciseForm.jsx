import { useId, useRef, useState } from 'react'

import { ApiError, api } from '../api.js'
import LoadingFields, { EMPTY_LOADING, loadingAnswered } from './LoadingFields.jsx'

/** A created entry, straight from the response, into a name-ordered list.
 *
 * Both places that add an exercise put the row they were handed into a list
 * they already have, rather than reading `exercises/` again (N11): the
 * catalogue page into the table it is showing, the session page into the
 * dropdown it is choosing from. One insert for both, because two would drift in
 * how they order themselves and the same movement would land in a different
 * place depending on which screen added it.
 *
 * The API orders by name in SQLite, which is not `localeCompare`, so a name
 * with an accent or an unusual case can land one row away from where a reload
 * will put it. That is the accepted cost of not re-fetching: the next load is
 * authoritative, and a second GET is a second chance to fail.
 */
export function insertByName(list, exercise) {
  const at = list.findIndex((entry) => entry.name.localeCompare(exercise.name) > 0)
  return at === -1 ? [...list, exercise] : [...list.slice(0, at), exercise, ...list.slice(at)]
}

/** One box, one button: a name goes into the shared catalogue (N7, N8).
 *
 * The same form stands on the catalogue page and, later, inside a running
 * session, so it owns the box, the request and the *failure* — and nothing
 * else. What counts as success differs by where it is standing (a new row in a
 * list here, a movement being recorded there), so the created entry is handed
 * straight up through `onAdded` and this component says nothing about it. It
 * made the request, so it is the one that can say it did not go through and
 * keep what was typed for the retry.
 *
 * Three outcomes, not two. A name already in the catalogue is not a failure:
 * the user asked for a movement to be in the list and it is, so the entry the
 * server handed back goes up through `onDuplicate` exactly as a created one
 * goes up through `onAdded`, and the box clears the same way (N5). Only a real
 * problem — a rejected name, a request that did not arrive — keeps what was
 * typed and says so.
 *
 * `onCancel` is optional: given one, a Cancel control appears beside Add; the
 * catalogue page passes none, because there is nothing to cancel back to.
 * `onDuplicate` is optional too; without one the form says it itself, so the
 * component is honest wherever it stands.
 *
 * It asks three things rather than one now: a movement also carries how it is
 * loaded, and this is the only place it is ever asked, because there is no edit
 * path to it afterwards (AGREED 2). The two extra fields and the rule for what
 * counts as an answer live in `LoadingFields`, shared for the same reason this
 * form is -- the zone asks the identical question of a movement that predates
 * the columns (07), and one question asked in two wordings is two questions.
 */
export default function AddExerciseForm({ onAdded, onDuplicate, onCancel }) {
  const [name, setName] = useState('')
  // How the movement is loaded, as the two strings the controls hand over.
  // Blank, and never defaulted: see LoadingFields for why.
  const [loading, setLoading] = useState(EMPTY_LOADING)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  // Only ever set when the caller passed no `onDuplicate`: the entry that
  // already exists, so the form can name it on its own behalf.
  const [duplicate, setDuplicate] = useState(null)
  // Two of these can be on a page at once one day; the label has to point at
  // its own box either way.
  const nameId = useId()
  const box = useRef(null)

  // Blank or nothing but spaces is nothing to add, and a movement whose loading
  // has not been answered is not addable either -- the answer is permanent, so
  // the one moment it can be given is this one. This decides whether the button
  // is live and never what gets sent: the name travels exactly as typed and the
  // server is the only place it is normalised (N9). A second, subtly different
  // rule here is a bug waiting for the day the two disagree.
  const unanswered = name.trim() === '' || !loadingAnswered(loading)

  async function submit(submitEvent) {
    submitEvent.preventDefault()
    // Enter in the box can submit while the button is disabled, and a second
    // send while one is running would add nothing but a duplicate (N8).
    if (unanswered || busy) return

    setBusy(true)
    setFailure(null)
    setDuplicate(null)
    try {
      // `bar_kg` as the string it was typed as, so a decimal column never sees a
      // float; `sides` as the number the API asks for, off a control that can
      // only ever hold "1" or "2".
      const created = await api.post('exercises/', {
        name,
        bar_kg: loading.bar_kg,
        sides: Number(loading.sides),
      })
      setName('')
      setLoading(EMPTY_LOADING)
      // Somebody adding three movements in a row types the next one straight
      // away; the caller may move focus of its own accord afterwards.
      box.current?.focus()
      onAdded(created)
    } catch (error) {
      // The one 400 that is not a complaint: the server refused the create and
      // handed back the row that already carries the name. `data` is optional
      // because a 500 or a dropped connection has no body to read.
      const existing =
        error instanceof ApiError && error.status === 400 ? (error.data?.existing ?? null) : null
      if (existing) {
        // Cleared and refocused exactly as a successful add leaves it: there is
        // nothing to retry, because the entry the typed name asked for is here.
        //
        // The typed bar and sides go with it, and nothing is said about them.
        // The entry that exists has its own loading -- or has none yet, in which
        // case the zone asks about it the first time it is held (07). Applying
        // what was typed here to that row would be an edit of a value that is
        // fixed forever (AGREED 2), through the back door.
        setName('')
        setLoading(EMPTY_LOADING)
        box.current?.focus()
        if (onDuplicate) onDuplicate(existing)
        else setDuplicate(existing)
        return
      }

      console.error(error)
      // Any other 400 is a sentence the API wrote for a human — a missing name,
      // a name past 120 characters — and it says it better than we can. Only a
      // failure with nothing to read falls back to the generic line, with what
      // was typed still in the box for another go.
      const rejection = error instanceof ApiError && error.status === 400 ? error.detail : null
      setFailure(rejection ?? 'Could not add that exercise. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-exercise-form" onSubmit={submit}>
      <p className="add-exercise-field">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          ref={box}
          type="text"
          // A movement's name is not a dictionary word and not a thing the
          // browser has seen typed into another site's box: an autocomplete
          // menu over the form and a red underline under `Zercher` are both
          // noise. Sentence capitalisation because the catalogue reads
          // "Romanian deadlift", and the name is stored as typed (N9).
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          // Enabled even while the request is in flight: a slow POST must not
          // eat a correction being typed.
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </p>
      {/* Enabled while a request is in flight, for the same reason the name box
          is: a slow POST must not eat an answer being corrected. */}
      <LoadingFields value={loading} onChange={setLoading} />
      <button className="button" type="submit" disabled={unanswered || busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {onCancel && (
        <button className="button" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
      {failure && (
        <p className="status" data-state="error">
          {failure}
        </p>
      )}
      {/* Neutral on purpose: nothing went wrong, so no error state (N5). React
          escapes the name for us: catalogue names are user data. */}
      {duplicate && <p className="status">"{duplicate.name}" is already in the catalogue.</p>}
    </form>
  )
}
