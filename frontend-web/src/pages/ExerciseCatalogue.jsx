import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api.js'
import AddExerciseForm, { insertByName } from '../components/AddExerciseForm.jsx'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

export default function ExerciseCatalogue() {
  useDocumentTitle('Exercise catalogue — Gym App')
  const { state, data, error } = useLoad(() => api.list('exercises/'))

  // The loaded catalogue becomes the page's own list: what is added from here
  // is known to this page without reading `exercises/` again (N11).
  const [exercises, setExercises] = useState(null)
  useEffect(() => {
    if (state === 'ready') setExercises(data)
  }, [state, data])

  // The entry the last Add put in the table, named back to whoever added it.
  // It belongs to the page rather than to the form, because a new row landing
  // somewhere in the middle of a long list is easy to miss.
  const [added, setAdded] = useState(null)

  // The entry a typed name turned out to already have. One line at a time under
  // the form: the last Add either landed a row or found one, never both.
  const [duplicate, setDuplicate] = useState(null)

  /** The created row, straight from the response, into the list in name order.
   *
   * The insert itself lives beside the form, because the session page does the
   * same thing to its dropdown and one movement should not land in two
   * different places depending on which screen added it.
   */
  function handleAdded(exercise) {
    setAdded(exercise)
    setDuplicate(null)
    setExercises((current) => insertByName(current, exercise))
  }

  /** The name is already a movement here, so the answer is that movement (N5).
   *
   * Nothing goes into the list: the entry is in it already, and the one flow
   * that exists to keep a second copy of a movement off the screen is the last
   * place to put one there. If the loaded list happens not to show it — a page
   * left open while somebody else added it — a reload is the answer; inventing
   * a row from this response would be a guess about where it belongs.
   */
  function handleDuplicate(exercise) {
    setAdded(null)
    setDuplicate(exercise)
  }

  return (
    <>
      <h1>Exercise catalogue</h1>
      <Status state={state} error={error} />

      {exercises !== null && (
        <>
          {/* Above the list: the list can be long, and the point of the page is
              no longer only to read it. The input event is caught here, as it
              bubbles out of the form, because typing the next name is what
              makes the last one's confirmation stale — and the form's business
              is the request, not what the page said about the one before. */}
          <section
            className="add-exercise"
            onInput={() => {
              setAdded(null)
              setDuplicate(null)
            }}
          >
            <h2>Add an exercise</h2>
            <AddExerciseForm onAdded={handleAdded} onDuplicate={handleDuplicate} />
            {added && <p className="add-exercise-added">Added {added.name}.</p>}
            {/* Neutral, and the name is a way in rather than a scolding: the
                same link the table's rows carry, so the movement they were
                looking for is one tap from the box they typed it into. */}
            {duplicate && (
              <p className="add-exercise-added">
                <Link to={`/exercises-catelog/${duplicate.id}`}>{duplicate.name}</Link> is already in
                the catalogue.
              </p>
            )}
          </section>

          {exercises.length === 0 ? (
            // With a form on the page, an empty catalogue is an invitation
            // rather than a dead end.
            <p>No exercises yet. Add the first one above.</p>
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
          )}
        </>
      )}
    </>
  )
}
