import { useEffect, useState } from 'react'

import { api } from '../api.js'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

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

/** The sets logged into one exercise, numbered 1, 2, 3… by position.
 *
 * Both lists on this page come through here — the held exercise's own sets and
 * the whole workout below it. Same data, two renderings, one phrasing: a set
 * reads identically in both, and there is no second wording to drift from.
 *
 * `performed_sets` arrives in the order the sets were logged, so nothing is
 * sorted here. An exercise with none says so rather than leaving a gap.
 */
function SetList({ sets }) {
  if (sets.length === 0) return <p>No sets logged yet.</p>

  return (
    <ol className="sets">
      {sets.map((set, index) => (
        <li className="set" key={set.id}>
          <span className="set-number">{index + 1}</span>
          <span className="set-measures">{setSummary(set)}</span>
        </li>
      ))}
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

/** One exercise of the session, with the sets logged into it so far.
 *
 * The API returns exercises in the order they were first started, so they are
 * numbered by position and neither sorted nor grouped here. An exercise whose
 * sets have all been deleted (chunk 05) keeps its heading rather than vanishing.
 */
function PerformedExercise({ performed, index }) {
  return (
    <li className="performed">
      <h3>
        {index}. {performed.exercise_name}
      </h3>

      <SetList sets={performed.performed_sets} />
    </li>
  )
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

  // Read-only reference data, already ordered by name: fetched once and used as
  // it arrives.
  const { state: catalogueState, data: exercises } = useLoad(() => api.list('exercises/'))

  // The loaded session becomes the page's own state: what gets logged into it
  // from here on is known to this page before it is re-read from the API.
  const [session, setSession] = useState(null)
  useEffect(() => {
    if (state === 'ready') setSession(data)
  }, [state, data])

  // The exercise being recorded into, by catalogue id — a UUID string, so it is
  // kept exactly as it arrived. Holding one is a client-side act (A10): nothing
  // is written until its first set (03.5), so a refresh comes back to the
  // dropdown with everything already logged still logged.
  const [heldId, setHeldId] = useState(null)
  const held = exercises?.find((exercise) => exercise.id === heldId) ?? null

  // What has already been done to the held exercise in this session, read off
  // the same `session` state the list below reads — not a second copy of it.
  // No block at all is the ordinary case: the exercise has simply not been
  // trained yet today, and one appears with its first set (03.5).
  const heldPerformed =
    session?.performed_exercises.find(
      (performed) => performed.exercise_definition === heldId,
    ) ?? null
  const heldSets = heldPerformed?.performed_sets ?? []

  // What is about to be logged. Kept as typed rather than as numbers, so an
  // empty box stays empty and a decimal point survives being typed. It outlives
  // a successful log on purpose (below); only letting go of the exercise
  // clears it, since what was typed belonged to that movement.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const entry = parseEntry(weight, reps)

  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState(null)

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

  /** Let go of the exercise, and of what was being typed into it.
   *
   * Both ways out of a hold end here — backing out of a mis-tap and finishing a
   * movement — because they are the same act on the client and neither is a
   * request: every set was saved as it was logged (A7), so there is nothing
   * left to write when the user is done with the exercise (A10). Nothing
   * records that a movement was finished, so holding it again later simply
   * continues it (A6).
   */
  function releaseExercise() {
    setHeldId(null)
    setWeight('')
    setReps('')
    setLogError(null)
  }

  return (
    <>
      <h1>Current session</h1>
      <Status state={state} error={error} />

      {state === 'ready' && !session && (
        <>
          <button className="button" type="button" onClick={startSession} disabled={starting}>
            {starting ? 'Starting…' : 'Start session'}
          </button>
          {startError && (
            <p className="status" data-state="error">
              {startError}
            </p>
          )}
        </>
      )}

      {session && (
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

          <section className="record-set">
            <h2>Record new exercise</h2>

            {held ? (
              <div className="held-exercise">
                {/* React escapes it for us: catalogue names are user data. */}
                <p className="held-name">Recording {held.name}</p>

                {/* Where the user is working, so the answer to "how many have I
                    done, and at what?" is here rather than in the section
                    below. */}
                <SetList sets={heldSets} />

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
                      tap cannot log a second set (A9). */}
                  <div className="log-set-actions">
                    <button className="button" type="submit" disabled={entry === null || logging}>
                      {logging ? 'Logging…' : 'Log set'}
                    </button>
                    {/* Saves nothing: there is nothing left to save. Do not go
                        looking for the request. */}
                    <button
                      className="log-exercise"
                      type="button"
                      onClick={releaseExercise}
                      disabled={!heldSets.length || logging}
                    >
                      Log exercise
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

                {/* Only while there is nothing to finish. Once a set exists,
                    Log exercise is the way out, and two controls doing one thing
                    is one too many. The way out of a mis-tap, not a control to
                    reach for mid-set (A8). */}
                {heldSets.length === 0 && (
                  <button className="change-exercise" type="button" onClick={releaseExercise}>
                    Change exercise
                  </button>
                )}
              </div>
            ) : (
              <>
                <select
                  aria-label="Exercise"
                  value=""
                  disabled={catalogueState !== 'ready'}
                  onChange={(event) => setHeldId(event.target.value)}
                >
                  <option value="">Choose an exercise</option>
                  {exercises?.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
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

          {/* Read straight off `session`, the one copy of the workout this page
              keeps. A set logged by the form above lands here the moment its
              POST resolves, with nothing wired between the two. */}
          <section className="completed-exercises">
            <h2>Completed exercises</h2>
            {session.performed_exercises.length === 0 ? (
              <p>No exercises logged yet.</p>
            ) : (
              <ol className="performed-exercises">
                {session.performed_exercises.map((performed, index) => (
                  <PerformedExercise key={performed.id} performed={performed} index={index + 1} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  )
}
