import { Link, useParams } from 'react-router-dom'

import { ApiError, api } from '../api.js'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

/** A missing exercise is an ordinary outcome for a stale link, not a failure. */
async function loadExercise(exerciseId) {
  try {
    return await api.get(`exercises/${exerciseId}/`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export default function ExerciseDetail() {
  const { exerciseId } = useParams()
  const { state, data: exercise, error } = useLoad(() => loadExercise(exerciseId), [exerciseId])

  // The name is only known once the API answers, so the tab title waits for it.
  useDocumentTitle(
    state === 'ready' ? `${exercise ? exercise.name : 'Exercise not found'} — Gym App` : null,
  )

  return (
    <>
      <h1>{state === 'ready' ? (exercise ? exercise.name : 'Exercise not found') : ''}</h1>
      <Status state={state} error={error} />

      {exercise && (
        <>
          <p className="meta">
            Added{' '}
            {new Date(exercise.created_at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            .
          </p>
          <p className="meta">
            <code>{exercise.id}</code>
          </p>
        </>
      )}

      <Link className="back" to="/exercises-catelog">
        ← Back to the catalogue
      </Link>
    </>
  )
}
