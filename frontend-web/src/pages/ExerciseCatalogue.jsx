import { Link } from 'react-router-dom'

import { api } from '../api.js'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

export default function ExerciseCatalogue() {
  useDocumentTitle('Exercise catalogue — Gym App')
  const { state, data: exercises, error } = useLoad(() => api.list('exercises/'))

  return (
    <>
      <h1>Exercise catalogue</h1>
      <Status state={state} error={error} />

      {state === 'ready' &&
        (exercises.length === 0 ? (
          <p>No exercises yet.</p>
        ) : (
          <>
            <p>
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'} in the catalogue.
            </p>
            <table className="catalogue">
              <thead>
                <tr>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => (
                  <tr key={exercise.id}>
                    <td>
                      {/* React escapes it for us: catalogue names are user data. */}
                      <Link to={`/exercises-catelog/${exercise.id}`}>{exercise.name}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))}
    </>
  )
}
