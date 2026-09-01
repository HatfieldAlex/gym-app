import { Link } from 'react-router-dom'

import { api } from '../api.js'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

function Session({ session }) {
  return (
    <li className="session">
      {/* A native disclosure: the list shows dates only, and opening one reveals
          its exercises. <details> gets the click, keyboard and screen-reader
          behaviour right without any state of our own. */}
      <details>
        <summary>
          {/* The date links onwards to the session's own page. Link calls
              preventDefault before navigating, which also cancels the summary's
              toggle, so the two clicks stay distinct: the date navigates, the
              rest of the row opens the dropdown. */}
          <Link to={`/training-sessions/${session.id}`}>
            <time dateTime={session.created_at}>
              {new Date(session.created_at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
          </Link>
        </summary>

        {/* The session serialiser nests its exercises in performed order, so a
            list of sessions is one request rather than one per session. */}
        {session.performed_exercises.length === 0 ? (
          <p>No exercises recorded in this session.</p>
        ) : (
          <ol className="exercises">
            {session.performed_exercises.map((performed) => (
              <li key={performed.id}>{performed.exercise_name}</li>
            ))}
          </ol>
        )}
      </details>
    </li>
  )
}

export default function TrainingSessions() {
  useDocumentTitle('Training sessions — Gym App')
  const { state, data: sessions, error } = useLoad(() => api.list('training-sessions/'))

  return (
    <>
      <h1>Training sessions</h1>
      <Status state={state} error={error} />

      {state === 'ready' &&
        (sessions.length === 0 ? (
          <p>No sessions logged yet.</p>
        ) : (
          <ul className="sessions">
            {sessions.map((session) => (
              <Session key={session.id} session={session} />
            ))}
          </ul>
        ))}
    </>
  )
}
