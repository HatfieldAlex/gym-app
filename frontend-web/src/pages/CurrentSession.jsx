import { useEffect, useState } from 'react'

import { api } from '../api.js'
import AddExerciseForm, { insertByName } from '../components/AddExerciseForm.jsx'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

/** The dropdown's last option: not an exercise, but the way to add one.
 *
 * A sentinel rather than an id, and one that no catalogue row can collide with:
 * every other value in that <select> is a UUID. It is read and thrown away by
 * the change handler — it must never reach `heldId`, where a value that matches
 * no catalogue entry would leave `held` null and the section showing the
 * dropdown again with nothing to explain why.
 */
const ADD_NEW = 'new'

/** One set as a single line: "60 kg × 8", or "8 reps" when it carried no weight.
 *
 * `weight_kg` arrives as a decimal string — "60.00" — so it goes through
 * `Number` to read as it was typed. A set that recorded no weight is a
 * bodyweight set, not a set missing a value: it says so in words rather than
 * showing `null`, `0 kg` or a dash.
 */
function setSummary(set) {
  const weight = set.weight_kg === null ? null : `${Number(set.weight_kg)} kg`
  if (set.reps === null) return weight ?? ''
  return weight === null ? `${set.reps} reps` : `${weight} × ${set.reps}`
}

/** When a past session was trained: "5 Aug".
 *
 * One format, used by every date in the zone — last time's caption and the
 * earlier lines under it (04). Three dates on one screen in two styles would
 * read as three different kinds of thing. Day and month only: the year is
 * noise for a movement trained within living memory, and the machine-readable
 * value is on the element for anything that wants the rest.
 */
function SessionDate({ at }) {
  return (
    <time dateTime={at}>
      {new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
    </time>
  )
}

/** One logged set: what it was, and the two ways to take it back.
 *
 * Buttons rather than a swipe (A8) — this runs on a desktop too — and small
 * enough that the numbers to their left stay lined up down the list.
 *
 * Delete arms on the first tap and goes through on the second, so nothing
 * mid-workout is one careless tap from gone. The armed state lives in `rows`
 * rather than here, because tapping anything else has to disarm it.
 *
 * In the zone the row knows two sets rather than one (03): `lastTime` is the
 * matching set from the previous session and `set` is this session's, either of
 * which can be missing when one workout ran longer than the other. `lastTime`
 * absent altogether means there is no such column — Completed exercises passes
 * nothing and renders exactly as it did.
 */
function SetRow({ set, number, scope, rows, lastTime }) {
  // A row this session has not reached yet has no set to act on, so it has no
  // row identity either: nothing can be opened, armed or failed on it.
  const row = set === null ? null : `${scope}:${set.id}`
  const armed = row !== null && rows.armed === row
  const failure = row !== null && rows.failure?.row === row ? rows.failure.message : null

  return (
    <li className="set">
      <span className="set-number">{number}</span>

      {/* Last time's set: read-only, and not a tap target of any kind. Fixing a
          set from a finished workout is the session detail page's job, and a
          mis-tap here would rewrite history without saying so. */}
      {lastTime !== undefined && (
        // `data-none` is the styling hook for "this workout stopped short", on
        // whichever side stopped: a dash is an absence, not a value, and 05
        // reads it at a different weight from the numbers around it.
        <span className="set-last" data-none={lastTime === null ? '' : undefined}>
          {lastTime === null ? '—' : setSummary(lastTime)}
        </span>
      )}

      {set === null ? (
        // Last time went a set further than this session has. The dash is the
        // second most useful thing on the screen: one more to go.
        <span className="set-measures" data-none="">
          —
        </span>
      ) : rows.open === row ? (
        // Nested in the <li> so the row keeps its number and its place: this is
        // the same set, being corrected, not a form standing in for it. The
        // boxes are labelled for a screen reader only — a visible label per box
        // would push the row onto a second line at phone width.
        <form
          className="edit-set"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault()
            rows.save(row, set)
          }}
        >
          <input
            aria-label="Weight (kg)"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            // Clearing it makes the set a bodyweight one (A5), so it is never
            // required here either.
            placeholder="—"
            value={rows.weight}
            onChange={(event) => rows.setWeight(event.target.value)}
          />
          <input
            aria-label="Reps"
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            value={rows.reps}
            onChange={(event) => rows.setReps(event.target.value)}
          />
          <button className="set-action" type="submit" disabled={rows.entry === null || rows.busy}>
            {rows.busy ? 'Saving…' : 'Save'}
          </button>
          <button className="set-action" type="button" onClick={rows.cancel} disabled={rows.busy}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="set-measures">{setSummary(set)}</span>
          <span className="set-actions">
            <button
              className="set-action"
              type="button"
              onClick={() => rows.edit(row, set)}
              disabled={rows.busy}
            >
              Edit
            </button>
            {/* Tabbing away is moving away too; the pointer half of it is in
                the hook, which sees taps that land on nothing focusable. */}
            <button
              className="set-action"
              data-armed={armed ? '' : undefined}
              type="button"
              onClick={() => rows.remove(row, set)}
              onBlur={() => rows.disarm(row)}
              disabled={rows.busy}
            >
              {armed ? 'Sure?' : 'Delete'}
            </button>
          </span>
        </>
      )}

      {/* On the row that failed, which is still sitting there unchanged: a set
          goes when the DELETE has gone through, not when it was asked for (A9). */}
      {failure && (
        <p className="status" data-state="error">
          {failure}
        </p>
      )}
    </li>
  )
}

/** The sets logged into one exercise, numbered 1, 2, 3… by position.
 *
 * Both lists on this page come through here — the held exercise's own sets and
 * the whole workout below it. Same data, two renderings, one phrasing: a set
 * reads identically in both, and there is no second wording to drift from.
 *
 * Numbering is position in the array and nothing else, so deleting set 2 of 4
 * leaves 1, 2, 3 without anything having to renumber them.
 *
 * `performed_sets` arrives in the order the sets were logged, so nothing is
 * sorted here. An exercise with none says so rather than leaving a gap.
 *
 * `lastTime` is the previous session's sets when the zone is showing them
 * beside these (03), and absent when it is not. With it, the list is *one row
 * per set number* rather than two lists side by side, and it runs as far as
 * whichever workout ran longer: set 2 sits beside set 2, and a set number with
 * no counterpart shows a dash on that side.
 */
function SetList({ sets, scope, rows, lastTime }) {
  const previous = lastTime ?? []
  const length = Math.max(sets.length, previous.length)
  if (length === 0) return <p>No sets logged yet.</p>

  return (
    // Two columns or one: the same rows are rendered without a comparison
    // beside them in Completed exercises and on a movement's first time, and
    // the two-column sizing (05) is only right when there is a second column.
    <ol className={lastTime === undefined ? 'sets' : 'sets sets--paired'}>
      {Array.from({ length }, (unused, index) => {
        const set = sets[index] ?? null
        return (
          <SetRow
            key={set === null ? `gap:${index}` : set.id}
            set={set}
            number={index + 1}
            scope={scope}
            rows={rows}
            lastTime={lastTime === undefined ? undefined : (previous[index] ?? null)}
          />
        )
      })}
    </ol>
  )
}

/** The typed entry as the API wants it, or `null` when it is not a set yet.
 *
 * Reps are required and whole and positive (A5) — a set of `0` or `-3` records
 * nothing. Weight is optional, because bodyweight movements have none, and a
 * blank one is `null` rather than `0`: no weight is not zero weight. What was
 * typed is passed through as the string it was typed as, so `62.5` reaches a
 * decimal column without a float rounding it first.
 */
function parseEntry(weight, reps) {
  if (!/^\d+$/.test(reps.trim()) || Number(reps) < 1) return null

  const typedWeight = weight.trim()
  if (typedWeight === '') return { weight_kg: null, reps: Number(reps) }
  // A half-typed weight is a mistake, not a bodyweight set.
  if (!/^\d+(\.\d+)?$/.test(typedWeight)) return null
  return { weight_kg: typedWeight, reps: Number(reps) }
}

/** The session with one set's stored values swapped for the ones just saved. */
function withSetReplaced(session, saved) {
  return {
    ...session,
    performed_exercises: session.performed_exercises.map((performed) =>
      performed.id === saved.performed_exercise
        ? {
            ...performed,
            performed_sets: performed.performed_sets.map((candidate) =>
              candidate.id === saved.id ? saved : candidate,
            ),
          }
        : performed,
    ),
  }
}

/** The session without that set.
 *
 * Its `PerformedExercise` stays put even when it was the last set in it: the
 * user deleted a set, not the movement, and deleting the parent behind their
 * back would also throw away the block a later set would rejoin (A6). It keeps
 * its heading and shows the empty line chunk 02.1 already renders.
 */
function withSetRemoved(session, removed) {
  return {
    ...session,
    performed_exercises: session.performed_exercises.map((performed) =>
      performed.id === removed.performed_exercise
        ? {
            ...performed,
            performed_sets: performed.performed_sets.filter(
              (candidate) => candidate.id !== removed.id,
            ),
          }
        : performed,
    ),
  }
}

/** The one row open for editing and the one armed for deletion — at most one of
 * each, across both lists.
 *
 * A set can be on screen twice at once: the held exercise's list and Completed
 * exercises are the same sets rendered in two places. So a row is named by the
 * list it is in as well as by its set — `held:<id>` — or opening Edit in one
 * would open the same set in the other.
 *
 * Both writes go straight into `session` from the response and stop there
 * (A9): `current/` is not re-read, and nothing changes on screen before the
 * server has agreed to it.
 */
function useSetRows(setSession) {
  // Which row, not which set: see above.
  const [open, setOpen] = useState(null)
  const [armed, setArmed] = useState(null)
  // Kept as typed, like the log form's boxes, so a decimal point survives being
  // typed and a cleared weight stays cleared.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  // The same rule as logging a set, from the same function: reps required and
  // positive, a blank weight meaning bodyweight rather than zero (A5).
  const entry = parseEntry(weight, reps)

  // Acting elsewhere disarms a delete, and on a touch screen most of "elsewhere"
  // is not focusable, so no blur reports it. While a row is armed, the next
  // pointer down anywhere but that button puts the safety back on — including
  // the second tap of a *different* row's Delete, which then only arms it.
  useEffect(() => {
    if (armed === null) return undefined

    function disarmElsewhere(event) {
      if (!event.target.closest?.('[data-armed]')) setArmed(null)
    }
    document.addEventListener('pointerdown', disarmElsewhere)
    return () => document.removeEventListener('pointerdown', disarmElsewhere)
  }, [armed])

  /** Open a row, seeded with what is stored — closing whatever was open. */
  function edit(row, set) {
    setOpen(row)
    // Through Number so a decimal column's "60.00" reads back as it was typed.
    setWeight(set.weight_kg === null ? '' : String(Number(set.weight_kg)))
    setReps(set.reps === null ? '' : String(set.reps))
    setArmed(null)
    setFailure(null)
  }

  /** Put the row back as it was. Nothing was sent, so there is nothing to undo. */
  function cancel() {
    setOpen(null)
    setFailure(null)
  }

  async function save(row, set) {
    if (entry === null || busy) return

    setBusy(true)
    setFailure(null)
    try {
      // Only the two fields this screen owns: a set's exercise is not editable
      // here, and the columns chunk 03.5 leaves null (A4) stay untouched.
      const saved = await api.patch(`performed-sets/${set.id}/`, entry)
      setSession((current) => withSetReplaced(current, saved))
      setOpen(null)
    } catch (failed) {
      console.error(failed)
      // The row stays open with what was typed still in it, ready to retry.
      setFailure({ row, message: 'Could not save that change. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  /** First tap arms this row, second tap deletes it. */
  async function remove(row, set) {
    if (armed !== row) {
      setArmed(row)
      setFailure(null)
      return
    }
    if (busy) return

    setBusy(true)
    setFailure(null)
    try {
      await api.delete(`performed-sets/${set.id}/`)
      setSession((current) => withSetRemoved(current, set))
      setArmed(null)
    } catch (failed) {
      console.error(failed)
      setFailure({ row, message: 'Could not delete that set. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  function disarm(row) {
    setArmed((current) => (current === row ? null : current))
  }

  /** Forget one list's rows, for when that list is about to go off screen.
   *
   * Nothing was sent, so nothing is lost — but a row left open or, worse, left
   * armed would come back that way when the list does.
   */
  function close(scope) {
    const inScope = (row) => row?.startsWith(`${scope}:`)
    setOpen((current) => (inScope(current) ? null : current))
    setArmed((current) => (inScope(current) ? null : current))
    setFailure((current) => (inScope(current?.row) ? null : current))
  }

  return {
    open,
    armed,
    weight,
    setWeight,
    reps,
    setReps,
    entry,
    busy,
    failure,
    edit,
    cancel,
    save,
    remove,
    disarm,
    close,
  }
}

/** One exercise of the session, with the sets logged into it so far.
 *
 * The API returns exercises in the order they were first started, so they are
 * numbered by position and neither sorted nor grouped here. An exercise whose
 * sets have all been deleted (chunk 05) keeps its heading rather than vanishing.
 */
function PerformedExercise({ performed, index, rows }) {
  return (
    <li className="performed">
      <h3>
        {index}. {performed.exercise_name}
      </h3>

      <SetList sets={performed.performed_sets} scope="completed" rows={rows} />
    </li>
  )
}

/** The second tap, in the place the first one was.
 *
 * Both ways out of a session confirm through here rather than through
 * `window.confirm`: a blocking native dialog mid-workout is easy to dismiss by
 * accident, lands wherever the browser puts it, and cannot be sized to a thumb.
 * Cancel puts the button back and nothing has been sent.
 */
function Confirm({ question, verb, busy, onConfirm, onCancel }) {
  return (
    <div className="confirm">
      <p className="confirm-question">{question}</p>
      <div className="confirm-actions">
        <button className="confirm-yes" type="button" onClick={onConfirm} disabled={busy}>
          {busy ? `${verb}…` : 'Confirm'}
        </button>
        <button className="confirm-no" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Whether that timestamp falls on today's date, in the reader's own timezone. */
function isToday(timestamp) {
  return new Date(timestamp).toDateString() === new Date().toDateString()
}

/**
 * The session being trained right now: start one, or pick the open one back up.
 *
 * Resuming needs nothing built for it. The API is the only place a session
 * lives (A7), so any page load — refresh, tab switch, a browser reopened the
 * next morning — finds the open one through `current/` and lands in the active
 * state.
 */
export default function CurrentSession() {
  useDocumentTitle('Current session — Gym App')

  // No open session comes back as 204, and so as `null` here. That is the
  // answer to the question, not a failure to answer it.
  const { state, data, error } = useLoad(() => api.get('training-sessions/current/'))

  // Reference data, already ordered by name, fetched once. Read-only until this
  // page grew a way to add to it (04), which is why the load feeds page state
  // rather than being rendered straight: a movement added mid-session has to
  // land somewhere, and it lands here.
  const { state: catalogueState, data: catalogueData } = useLoad(() => api.list('exercises/'))

  // The loaded session becomes the page's own state: what gets logged into it
  // from here on is known to this page before it is re-read from the API.
  const [session, setSession] = useState(null)
  useEffect(() => {
    if (state === 'ready') setSession(data)
  }, [state, data])

  // The same move, for the same reason: the loaded catalogue becomes the page's
  // own list, so an exercise added from the dropdown below is in it from then on
  // without `exercises/` being read again (N11).
  const [catalogue, setCatalogue] = useState(null)
  useEffect(() => {
    if (catalogueState === 'ready') setCatalogue(catalogueData)
  }, [catalogueState, catalogueData])

  // The exercise being recorded into, by catalogue id — a UUID string, so it is
  // kept exactly as it arrived. Holding one is a client-side act (A10): nothing
  // is written until its first set (03.5), so a refresh comes back to the
  // dropdown with everything already logged still logged.
  const [heldId, setHeldId] = useState(null)
  const held = catalogue?.find((exercise) => exercise.id === heldId) ?? null

  // Whether the dropdown has been swapped for the add form. One of three states
  // this section is in — dropdown, adding, holding — and never two at once, so
  // it is only ever read where nothing is held.
  const [adding, setAdding] = useState(false)

  // The name of the movement a typed one turned out to already be, for the
  // quiet line under it while it is held (N5). It belongs to this hold: it is
  // dropped with the exercise, in `releaseExercise`.
  const [alreadyThere, setAlreadyThere] = useState(null)

  // Whether the page is the zone. One boolean is the whole mechanism (Z4):
  // recording a movement is a state of this tab, not a destination, so there is
  // no route, no query parameter, no history entry and nothing persisted — a
  // reload comes back to the session page, exactly as it already came back to
  // the dropdown with the hold dropped (A10).
  const [zoneOpen, setZoneOpen] = useState(false)

  // What has already been done to the held exercise in this session, read off
  // the same `session` state the list below reads — not a second copy of it.
  // No block at all is the ordinary case: the exercise has simply not been
  // trained yet today, and one appears with its first set (03.5).
  const heldPerformed =
    session?.performed_exercises.find(
      (performed) => performed.exercise_definition === heldId,
    ) ?? null
  const heldSets = heldPerformed?.performed_sets ?? []

  // What was done to this movement before today: fetched once, when it is
  // picked (Z5), and refetched only when a different one is (03). Not after
  // logging a set — the endpoint's answer cannot have changed, because the only
  // new sets are this session's, and those are on screen already.
  //
  // `exclude_session` is not optional. Without it the running workout becomes
  // its own "last time" the moment a second set goes in, and both columns show
  // the same numbers. With no exercise held there is nothing to ask, so the
  // loader answers `null` rather than firing a request.
  const history = useLoad(
    () =>
      heldId === null || session === null
        ? Promise.resolve(null)
        : api.get(
            'performed-exercises/history/' +
              `?exercise_definition=${heldId}` +
              `&exclude_session=${session.id}` +
              '&limit=3',
          ),
    [heldId],
  )
  // Newest trained first, so last time is the head of it and the two behind it
  // are the Earlier lines (04) — the same three the one request already
  // brought back (Z7), never a second ask. Fewer than three trained sessions
  // simply makes this shorter, or empty.
  const lastTime = history.data?.[0] ?? null
  const earlier = history.data?.slice(1) ?? []

  // What is about to be logged. Kept as typed rather than as numbers, so an
  // empty box stays empty and a decimal point survives being typed. It outlives
  // a successful log on purpose (below); only letting go of the exercise
  // clears it, since what was typed belonged to that movement.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const entry = parseEntry(weight, reps)

  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState(null)

  // Correcting and removing sets, for every row on the page (chunk 05). It
  // writes into the same `session` state as logging does, so a set fixed in one
  // list is fixed in the other with nothing wired between them.
  const rows = useSetRows(setSession)

  const [starting, setStarting] = useState(false)
  // <Status> speaks for the initial load, so a failed start needs its own line.
  const [startError, setStartError] = useState(null)

  async function startSession() {
    setStarting(true)
    setStartError(null)
    try {
      setSession(await api.post('training-sessions/', {}))
    } catch (failure) {
      console.error(failure)
      setStartError('Could not start a session. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  /** Save the typed set: up to two requests, then straight into `session`.
   *
   * The `PerformedExercise` is created here and nowhere earlier, because until
   * now there was nothing to put in it (A10). An exercise already trained in
   * this session is reused rather than started again (A6), so a workout that
   * wanders back to a movement keeps one block for it.
   *
   * Both lists redraw off `setSession` alone — there is one copy of the log on
   * this page, so nothing is wired between them and `current/` is not re-read.
   */
  async function logSet(submitEvent) {
    submitEvent.preventDefault()
    if (entry === null || logging) return

    setLogging(true)
    setLogError(null)
    try {
      let performed = heldPerformed
      if (performed === null) {
        const created = await api.post('performed-exercises/', {
          training_session: session.id,
          exercise_definition: heldId,
        })
        // That serializer answers without `performed_sets`, and both lists read
        // it, so the empty array it stands for is filled in here.
        performed = { ...created, performed_sets: [] }
        setSession((current) => ({
          ...current,
          performed_exercises: [...current.performed_exercises, performed],
        }))
      }

      const set = await api.post('performed-sets/', {
        performed_exercise: performed.id,
        ...entry,
      })
      setSession((current) => ({
        ...current,
        performed_exercises: current.performed_exercises.map((candidate) =>
          candidate.id === performed.id
            ? { ...candidate, performed_sets: [...candidate.performed_sets, set] }
            : candidate,
        ),
      }))
      // Weight and reps stay as they are: another set of the same thing is the
      // common case, and it should cost one tap.
    } catch (failure) {
      console.error(failure)
      setLogError('Could not log that set. Please try again.')
    } finally {
      setLogging(false)
    }
  }

  /** Adding a movement is choosing it: the section goes straight to recording.
   *
   * This is the whole point of the chunk (N10). The created row goes into the
   * page's copy of the catalogue — so it is in the dropdown for the rest of the
   * session, with no second GET (N11) — and is held on the spot, which lands the
   * section in exactly the state choosing anything else from the list lands it
   * in: the name, an empty set list, the weight and reps boxes.
   *
   * Nothing is written to the session. A hold is client-side (A10): the first
   * set is still what creates the `PerformedExercise`, so a movement added and
   * then thought better of leaves the workout exactly as it was.
   */
  function holdCreated(created) {
    setCatalogue((list) => insertByName(list, created))
    setHeldId(created.id)
    setAdding(false)
  }

  /** The name was already a movement, so that movement is the answer (N5).
   *
   * It is put into the list first if it is not in it — which happens when this
   * page loaded before somebody else added it. The catalogue *page* deliberately
   * does the opposite, because there the list is a table being read and a
   * missing row is a stale read that a reload fixes. Here the list is what
   * `held` is looked up in, so an entry about to be recorded has to be in it or
   * the section cannot show the movement it is recording.
   */
  function holdExisting(existing) {
    setCatalogue((list) =>
      list.some((entry) => entry.id === existing.id) ? list : insertByName(list, existing),
    )
    // Said quietly under the name, not as an error: what matters mid-workout is
    // that recording has started against the movement they meant.
    setAlreadyThere(existing.name)
    setHeldId(existing.id)
    setAdding(false)
  }

  /** Let go of the exercise, and of what was being typed into it.
   *
   * Both ways out of a hold end here — Change exercise backing out of a mis-tap
   * and Log exercise finishing a movement — because they are the same act on the
   * client and neither is a request: every set was saved as it was logged (A7),
   * so there is nothing left to write when the user is done with the exercise
   * (A10). Nothing records that a movement was finished, so holding it again
   * later simply continues it (A6).
   *
   * Neither one deletes anything. Letting go of an exercise leaves every set
   * logged into it exactly where it is, in Completed exercises; removing a set
   * is chunk 05's job, on the set itself.
   */
  function releaseExercise() {
    setHeldId(null)
    setWeight('')
    setReps('')
    setLogError(null)
    // Both belong to the movement being let go: the note is about the name that
    // held it, and a half-typed add form must not be what Change exercise
    // returns to.
    setAlreadyThere(null)
    setAdding(false)
    // Its list of sets goes with it; the same sets are still below, editable
    // there, and every one of them is still stored.
    rows.close('held')
  }

  /** Leave the zone: the × and Log exercise, and every exit made elsewhere.
   *
   * It is safe to be blunt about, because it destroys nothing: every set
   * reached the API as it was logged (A7) and letting go of a movement never
   * deleted anything. Going out through `releaseExercise` is what stops a row
   * left open — or, worse, left armed for deletion — from being there waiting
   * when the zone is opened again.
   */
  function closeZone() {
    releaseExercise()
    setZoneOpen(false)
  }

  // Which way out is waiting for its second tap — 'end', 'discard' or neither.
  // One at a time, so opening either confirmation closes the other and the two
  // questions can never both be on screen asking about the same session.
  const [confirming, setConfirming] = useState(null)
  const [exiting, setExiting] = useState(false)
  // Which control failed as well as what to say, so the message appears under
  // the tap that failed rather than at the other end of the page.
  const [exitError, setExitError] = useState(null)

  // Only for a session left running from a previous day, which is nearly always
  // one the user forgot to end. Mid-workout the only way out is End: a button
  // that throws the workout away has no business sitting under the same thumb
  // as one that keeps it.
  const stale = session !== null && !isToday(session.started_at)

  /** Back to the Start state, the session having been ended or deleted.
   *
   * There is nothing to write and nothing to save: every set went to the API as
   * it was logged (A7). The client-side odds and ends do have to go, though —
   * a held exercise, an open zone or a row left armed belongs to the workout
   * that just finished, not to the next one — a session ended or discarded can
   * never leave the zone up over no session at all.
   */
  function leaveSession() {
    setSession(null)
    setConfirming(null)
    setExitError(null)
    closeZone()
    rows.close('completed')
  }

  /** Close the workout and keep it: it is in history from here on.
   *
   * `end/` stamps `ended_at` server-side — the client never writes it — and the
   * sets are already attached, so the response is not needed for anything and
   * the page does not navigate. It simply has no open session any more.
   */
  async function endSession() {
    if (exiting) return

    setExiting(true)
    setExitError(null)
    try {
      await api.post(`training-sessions/${session.id}/end/`, {})
      leaveSession()
    } catch (failure) {
      console.error(failure)
      // The session stays on screen with the question still open, ready to
      // retry or to cancel out of. A failed end must never blank the page.
      setExitError({ action: 'end', message: 'Could not end the session. Please try again.' })
    } finally {
      setExiting(false)
    }
  }

  /** Throw the workout away: the DELETE cascades to its exercises and sets. */
  async function discardSession() {
    if (exiting) return

    setExiting(true)
    setExitError(null)
    try {
      await api.delete(`training-sessions/${session.id}/`)
      leaveSession()
    } catch (failure) {
      console.error(failure)
      setExitError({
        action: 'discard',
        message: 'Could not discard the session. Please try again.',
      })
    } finally {
      setExiting(false)
    }
  }

  return (
    <>
      <h1>Current session</h1>
      <Status state={state} error={error} />

      {state === 'ready' && !session && (
        <>
          <button
            className="button button--tap button--major"
            type="button"
            onClick={startSession}
            disabled={starting}
          >
            {starting ? 'Starting…' : 'Start session'}
          </button>
          {startError && (
            <p className="status" data-state="error">
              {startError}
            </p>
          )}
        </>
      )}

      {session &&
        (zoneOpen ? (
          /* The takeover (Z1): while the zone is open the page renders it
             *instead of* its other contents rather than on top of them, so
             there is nothing to position, nothing to stack, no scroll to lock
             and no focus to trap. The <h1> above stays, so the user always
             knows which tab they are on, and the nav bar is App.jsx's, outside
             this page and untouched.

             It keeps `record-set`, the class the recording setup below was
             already laid out by: this is that section given the whole screen,
             not a new one. */
          <section className="record-set exercise-zone">
            <div className="zone-header">
              {/* What the screen is about: the movement once one is held, and
                  the question until then (Z2). React escapes it for us —
                  catalogue names are user data. */}
              <h2>{held ? held.name : 'Record new exercise'}</h2>
              {/* The only way out, and there is one of it (Z3): no Escape, no
                  browser Back, no tap-outside, because under Z1 there is no
                  outside. Blunt on purpose — it destroys nothing. */}
              <button
                className="zone-close"
                type="button"
                aria-label="Close"
                onClick={closeZone}
              >
                ×
              </button>
            </div>

            {held ? (
              <div className="held-exercise">
                {/* Only after a typed name turned out to exist already, and only
                    for as long as this movement is held. Neutral: nothing went
                    wrong, and the movement it is about is the zone's heading,
                    directly above it. */}
                {alreadyThere && (
                  <p className="status">{alreadyThere} was already in the catalogue.</p>
                )}

                <form className="log-set" onSubmit={logSet}>
                  <p>
                    <label htmlFor="set-weight">Weight (kg)</label>
                    <input
                      id="set-weight"
                      type="number"
                      // The decimal keypad on a phone: plates come in halves.
                      inputMode="decimal"
                      step="any"
                      min="0"
                      // Blank is a bodyweight set, so this one is never required.
                      placeholder="—"
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                    />
                  </p>
                  <p>
                    <label htmlFor="set-reps">Reps</label>
                    <input
                      id="set-reps"
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="1"
                      value={reps}
                      onChange={(event) => setReps(event.target.value)}
                    />
                  </p>
                  {/* One tap per set and one tap per movement: the two sizes of
                      thing this section does. Log set is off until the entry is
                      a set, and off again while it is being saved, so a second
                      tap cannot log a second set (A9).

                      Change exercise sits beside them whatever has happened, so
                      there is never a state with an exercise held and no visible
                      way back to the dropdown. It deletes nothing — no button in
                      this section does, at any point. Once a set is saved it
                      stays saved, and a wrong exercise is simply left behind
                      with whatever was logged into it. */}
                  <div className="log-set-actions">
                    <button
                      className="button button--tap"
                      type="submit"
                      disabled={entry === null || logging}
                    >
                      {logging ? 'Logging…' : 'Log set'}
                    </button>
                    {/* Saves nothing: there is nothing left to save. Do not go
                        looking for the request. Only once there is a movement to
                        call finished — before that, Change exercise is the way
                        out and this would be a disabled button saying nothing. */}
                    {heldSets.length > 0 && (
                      <button
                        className="log-exercise"
                        type="button"
                        onClick={closeZone}
                        disabled={logging}
                      >
                        Log exercise
                      </button>
                    )}
                    {/* Nearly the same act as Log exercise — both let go of the
                        hold — but a different thing to the user, and now a
                        different destination: this one is "wrong exercise, take
                        me back", so it stays in the zone and asks again, where
                        "that movement is done" leaves. */}
                    <button
                      className="change-exercise"
                      type="button"
                      onClick={releaseExercise}
                      disabled={logging}
                    >
                      Change exercise
                    </button>
                  </div>
                  {/* Beside the buttons, where the tap that failed was: nothing
                      typed is touched, so the same values are there to retry. */}
                  {logError && (
                    <p className="status" data-state="error">
                      {logError}
                    </p>
                  )}
                </form>

                {/* Where the user is working, so the answer to "how many have I
                    done, and at what?" is here rather than in the section
                    below — but under the form rather than above it (07). This
                    list grows by a row every time Log set is tapped, and above
                    the boxes each new set would push the button another row
                    down the screen; below them, the fifth set is logged from
                    the same place as the first. Last time's sets arrive into
                    the same place, beside them, and for the same reason:
                    nothing that loads may move Log set.

                    All three states before there is a comparison are ordinary
                    and none of them is an error. A history that will not load
                    is a nicety that did not arrive: it never disables Log set,
                    never blanks the zone and never reaches <Status>, which
                    speaks for the session. */}
                <div className="last-time">
                  {history.state === 'loading' && <p className="last-time-note">Loading…</p>}

                  {history.state === 'error' && (
                    <p className="status" data-state="error">
                      Could not load what you did last time.
                    </p>
                  )}

                  {history.state === 'ready' && lastTime === null && (
                    <p className="last-time-note">
                      First time — nothing recorded for this exercise yet.
                    </p>
                  )}

                  {/* Two headers over two columns, and the date under the
                      first: the block means nothing without knowing when last
                      time was. */}
                  {lastTime !== null && (
                    <div className="paired-heads">
                      <span className="set-number" />
                      <span className="set-last">
                        Last time
                        <SessionDate at={lastTime.training_session_started_at} />
                      </span>
                      <span className="set-measures">This session</span>
                    </div>
                  )}

                  <SetList
                    sets={heldSets}
                    scope="held"
                    rows={rows}
                    lastTime={lastTime === null ? undefined : lastTime.performed_sets}
                  />

                  {/* The two sessions before last time, a line each: the date
                      and what was lifted, run together in performed order. One
                      session is a target; three are a direction (Z7).

                      A line, not a row and not a table — nothing here is meant
                      to be read against the numbers above, only glanced at —
                      and nothing here is tappable: history is fixed on this
                      screen, and the session detail page is where an old set
                      gets fixed.

                      No heading when there is nothing under it. A movement done
                      exactly once before would otherwise show an empty
                      "Earlier", which reads as something that failed to
                      load. */}
                  {earlier.length > 0 && (
                    <div className="earlier-sessions">
                      <h3>Earlier</h3>
                      <ul>
                        {earlier.map((performed) => (
                          <li key={performed.id}>
                            <SessionDate at={performed.training_session_started_at} />
                            <span>
                              {performed.performed_sets.map(setSummary).join(', ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : adding ? (
              /* In place of the dropdown, not beside it: the section shows one
                 of its three states at a time. The form is the component the
                 catalogue page uses — the box, the request and the failures are
                 all its own — with the three props this page needs. Cancel is
                 the way back out of a mis-tap, the same job Change exercise does
                 one state along. */
              <AddExerciseForm
                onAdded={holdCreated}
                onDuplicate={holdExisting}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <>
                <select
                  aria-label="Exercise"
                  value=""
                  disabled={catalogueState !== 'ready'}
                  onChange={(event) => {
                    const chosen = event.target.value
                    // The sentinel opens the form and goes no further: `heldId`
                    // holds catalogue ids and nothing else.
                    if (chosen === ADD_NEW) setAdding(true)
                    else setHeldId(chosen)
                  }}
                >
                  <option value="">Choose an exercise</option>
                  {catalogue?.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                  {/* Last, after the movements, and inside the <select>: this is
                      where the user is standing when they find the list has no
                      name for what they are about to do. It rides the dropdown's
                      disabled state too, so a catalogue that would not load
                      offers no way to add blind to it. */}
                  <option value={ADD_NEW}>+ Add a new exercise…</option>
                </select>
                {/* <Status> above speaks for the session, so a catalogue that
                    will not load says so here rather than looking like one. */}
                {catalogueState === 'error' && (
                  <p className="status" data-state="error">
                    Could not load the exercise list. Please try again.
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            <p className="meta">
              Started{' '}
              <time dateTime={session.started_at}>
                {new Date(session.started_at).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              .
            </p>

            {/* A quiet line rather than a banner: most of the time this session
                is simply one the user forgot to end yesterday, and the answer is
                still "yes, throw it away" — but it is their workout, so it says
                when it started and asks. */}
            {stale && (
              <div className="stale-session">
                {confirming === 'discard' ? (
                  <Confirm
                    question="Discard this workout? Everything logged in it is deleted."
                    verb="Discarding"
                    busy={exiting}
                    onConfirm={discardSession}
                    onCancel={() => setConfirming(null)}
                  />
                ) : (
                  <>
                    <p>
                      Started on{' '}
                      <time dateTime={session.started_at}>
                        {new Date(session.started_at).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </time>
                      . Still training?
                    </p>
                    <button
                      className="discard-session"
                      type="button"
                      disabled={exiting}
                      onClick={() => {
                        setConfirming('discard')
                        setExitError(null)
                      }}
                    >
                      Discard
                    </button>
                  </>
                )}

                {exitError?.action === 'discard' && (
                  <p className="status" data-state="error">
                    {exitError.message}
                  </p>
                )}
              </div>
            )}

            {/* The tab's one control (Z2): the chooser and its heading are
                inside the zone now, so what stands here is the door to it.
                Full width and unmistakable, the treatment Start session and
                End session already have. */}
            <button
              className="button button--tap button--major"
              type="button"
              onClick={() => setZoneOpen(true)}
            >
              Record new exercise
            </button>

            {/* Read straight off `session`, the one copy of the workout this page
                keeps. A set logged in the zone lands here the moment its POST
                resolves, with nothing wired between the two — so closing the
                zone comes back to a list that already has it. */}
            <section className="completed-exercises">
              <h2>Completed exercises</h2>
              {session.performed_exercises.length === 0 ? (
                <p>No exercises logged yet.</p>
              ) : (
                <ol className="performed-exercises">
                  {session.performed_exercises.map((performed, index) => (
                    <PerformedExercise
                      key={performed.id}
                      performed={performed}
                      index={index + 1}
                      rows={rows}
                    />
                  ))}
                </ol>
              )}
            </section>

            {/* Outside Completed exercises and at the very bottom of the page, a
                long scroll clear of Log set: this is the one tap that closes the
                workout, and it should take deliberate reaching for. Ending an
                empty session is allowed and needs no special case — it lands in
                history with no exercises, which the list and detail pages already
                render. */}
            <section className="end-session">
              {confirming === 'end' ? (
                <Confirm
                  question="End this session?"
                  verb="Ending"
                  busy={exiting}
                  onConfirm={endSession}
                  onCancel={() => setConfirming(null)}
                />
              ) : (
                // Disabled only while a discard is in flight — the one moment
                // this session might be about to stop existing.
                <button
                  className="button button--tap button--major"
                  type="button"
                  disabled={exiting}
                  onClick={() => {
                    setConfirming('end')
                    setExitError(null)
                  }}
                >
                  End session
                </button>
              )}

              {exitError?.action === 'end' && (
                <p className="status" data-state="error">
                  {exitError.message}
                </p>
              )}
            </section>
          </>
        ))}
    </>
  )
}
