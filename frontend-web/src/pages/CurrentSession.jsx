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

/** One exercise of the session, with the sets logged into it so far.
 *
 * The API returns exercises in the order they were first started and their sets
 * in the order they were logged, so both are numbered by position and neither is
 * sorted or grouped here. An exercise whose sets have all been deleted (chunk
 * 05) keeps its heading rather than vanishing.
 */
function PerformedExercise({ performed, index }) {
  const sets = performed.performed_sets

  return (
    <li className="performed">
      <h3>
        {index}. {performed.exercise_name}
      </h3>

      {sets.length === 0 ? (
        <p>No sets logged yet.</p>
      ) : (
        <ol className="sets">
          {sets.map((set, setIndex) => (
            <li className="set" key={set.id}>
              <span className="set-number">{setIndex + 1}</span>
              <span className="set-measures">{setSummary(set)}</span>
            </li>
          ))}
        </ol>
      )}
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

  // The loaded session becomes the page's own state: what gets logged into it
  // from here on is known to this page before it is re-read from the API.
  const [session, setSession] = useState(null)
  useEffect(() => {
    if (state === 'ready') setSession(data)
  }, [state, data])

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
            <p>Logging a set is not built yet.</p>
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
