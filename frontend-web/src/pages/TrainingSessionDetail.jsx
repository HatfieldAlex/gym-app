import { Link, useParams } from 'react-router-dom'

import { ApiError, api } from '../api.js'
import Status from '../components/Status.jsx'
import Worked from '../components/Worked.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'
import { loadingOf, weightParts } from '../sets.js'

/** A missing session is an ordinary outcome for a stale link, not a failure. */
async function loadSession(sessionId) {
  try {
    return await api.get(`training-sessions/${sessionId}/`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/* Every measure a set can record. A set fills in only the ones its exercise
   calls for, so each table below drops the columns its sets left empty. */
const SET_COLUMNS = [
  { key: 'weight_kg', label: 'Weight (kg)' },
  { key: 'reps', label: 'Reps' },
  { key: 'distance_m', label: 'Distance (m)' },
  { key: 'duration_s', label: 'Duration (s)' },
  { key: 'rpe', label: 'RPE' },
]

function countOf(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`
}

/** The date alone, as the list shows it. */
function sessionDate(session) {
  return new Date(session.created_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** The Weight (kg) cell: the set's working and its answer, or the raw total.
 *
 * Under a header that already says **Weight (kg)**, `20 + 2 × 45` · `= 110` is
 * the whole story of a set: what the bar was, what went on one side, and what it
 * came to, with the answer drawn at the weight the column was always read at.
 * The unit is left off because the column has already said it.
 *
 * `weightParts` says whether there is any working at all, and it is the only
 * thing asked. Every set it has nothing to add to — a bodyweight set, a movement
 * nobody has said how to load, a single unloaded side, a total lighter than its
 * own bar — comes back with no working, and the cell then renders the raw value
 * it has always rendered: `110.00`, trailing zeros and all, in no elements. A
 * set this feature cannot describe is a set it does not touch.
 */
function weightCell(set, loading) {
  const parts = weightParts(set.weight_kg, loading, { unit: false })
  if (parts === null || parts.working === null) return set.weight_kg ?? '—'
  return <Worked working={parts.working} total={parts.total} />
}

function PerformedExercise({ performed, index }) {
  const sets = performed.performed_sets
  const columns = SET_COLUMNS.filter((column) => sets.some((set) => set[column.key] !== null))
  // How the movement is loaded, once for the whole table: one performed
  // exercise is one movement, and the API carries it here so this page stays
  // the single request it has always been (W2).
  const loading = loadingOf(performed)

  return (
    <li className="performed">
      <h2>
        {index}. {performed.exercise_name}
      </h2>

      {sets.length === 0 ? (
        <p>No sets recorded.</p>
      ) : (
        <table className="sets">
          <thead>
            <tr>
              <th>Set</th>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sets.map((set, setIndex) => (
              <tr key={set.id}>
                <th scope="row">{setIndex + 1}</th>
                {columns.map((column) => (
                  // An empty cell means this set did not record that measure.
                  <td key={column.key}>
                    {column.key === 'weight_kg' ? weightCell(set, loading) : set[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

export default function TrainingSessionDetail() {
  const { sessionId } = useParams()
  const { state, data: session, error } = useLoad(() => loadSession(sessionId), [sessionId])

  // The date is only known once the API answers, so the tab title waits for it.
  useDocumentTitle(
    state === 'ready'
      ? `${session ? sessionDate(session) : 'Session not found'} — Gym App`
      : null,
  )

  return (
    <>
      <h1>{state === 'ready' ? (session ? sessionDate(session) : 'Session not found') : ''}</h1>
      <Status state={state} error={error} />

      {session && (
        <>
          <p className="meta">
            {session.type} session, started{' '}
            <time dateTime={session.created_at}>
              {new Date(session.created_at).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            .
          </p>
          <p className="meta">
            {countOf(session.performed_exercises.length, 'exercise', 'exercises')},{' '}
            {countOf(
              session.performed_exercises.reduce((n, p) => n + p.performed_sets.length, 0),
              'set',
              'sets',
            )}
            .
          </p>

          {/* The detail route nests the sets inside the exercises, so the whole
              page is one request and no per-exercise follow-ups. */}
          {session.performed_exercises.length === 0 ? (
            <p className="meta">No exercises recorded in this session.</p>
          ) : (
            <ol className="performed-exercises">
              {session.performed_exercises.map((performed, index) => (
                <PerformedExercise key={performed.id} performed={performed} index={index + 1} />
              ))}
            </ol>
          )}
        </>
      )}

      <Link className="back" to="/training-sessions">
        ← Back to training sessions
      </Link>
    </>
  )
}
