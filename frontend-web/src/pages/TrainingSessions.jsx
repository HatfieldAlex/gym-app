import { api } from '../api.js'
import Status from '../components/Status.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

function Session({ session }) {
  return (
    <li className="session">
      <h2>{session.type}</h2>
      <time dateTime={session.created_at}>
        {new Date(session.created_at).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>

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
