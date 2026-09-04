import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Confirm from '../components/Confirm.jsx'
import Status from '../components/Status.jsx'
import { useEditGate } from '../editing.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'

// The API answers with the stored value; these are the words for it. Falling
// back to the raw value keeps a kind added later readable rather than blank.
const KIND_LABELS = { idea: 'Idea', bug: 'Bug', other: 'Other' }

function Note({ note }) {
  return (
    <li className="note">
      <p className="note-body">{note.body}</p>
      <p className="note-meta">
        <time dateTime={note.created_at}>
          {new Date(note.created_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
        {' · '}
        {KIND_LABELS[note.kind] ?? note.kind}
        {/* page_path is blank for a note filed where the app did not know the
            screen, so it only earns a separator when there is one. */}
        {note.page_path && (
          <>
            {' · '}
            <code>{note.page_path}</code>
          </>
        )}
      </p>
    </li>
  )
}

function LoggedNotes() {
  // The API orders newest first, so nothing here sorts. Read-only throughout:
  // a note is triaged in the admin, not from this list.
  const { state, data: notes, error } = useLoad(() => api.list('feedback-notes/'))

  return (
    <section className="notes-section">
      <h2>Your notes</h2>
      <Status state={state} error={error} />

      {state === 'ready' &&
        (notes.length === 0 ? (
          <p className="status">No notes yet.</p>
        ) : (
          <ul className="notes">
            {notes.map((note) => (
              <Note key={note.id} note={note} />
            ))}
          </ul>
        ))}
    </section>
  )
}

function ExportSection() {
  // Its own busy/failed, like LoggedNotes' own load: a failed download leaves
  // Log out above and the notes below untouched.
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleDownload() {
    setBusy(true)
    setFailed(false)
    try {
      const { blob, filename } = await api.download('export/')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      // The anchor is in the document before it is clicked (Firefox ignores a
      // click on a detached one), and the object URL is revoked on the next
      // tick rather than immediately (Safari cancels a save whose URL goes in
      // the same task).
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (error) {
      console.error(error)
      setFailed(true)
    } finally {
      // Unlike Log out, this page is still standing afterwards.
      setBusy(false)
    }
  }

  return (
    <section className="export-section">
      <h2>Download your data</h2>
      <p className="export-summary">
        A zip of everything you can see in the app: one CSV per table, and{' '}
        <code>workouts.csv</code> with a row for every set you have logged.
      </p>
      <button
        className="button button--tap"
        type="button"
        onClick={handleDownload}
        disabled={busy}
      >
        {busy ? 'Preparing…' : 'Download'}
      </button>
      {failed && (
        <p className="status" data-state="error">
          Could not prepare your download. Please try again.
        </p>
      )}
    </section>
  )
}

/** `1 set` / `4 sets`, because a row that reads "1 sets" reads as a bug. */
function setCount(count) {
  return `${count} ${count === 1 ? 'set' : 'sets'}`
}

/** What a row of the list says. Its own function so the row and the button
 *  inside it are never two slightly different sentences. */
function blockLabel(block) {
  return [
    new Date(block.training_session_started_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    block.training_session_type,
    block.exercise_name,
    setCount(block.performed_sets.length),
  ].join(' · ')
}

/** The five columns a set is, in the order the record holds them.
 *
 * Every set gets all five boxes, filled or not: this screen is the record and
 * not a reading of it, and an empty box is how a set says it did not measure
 * that. The keyboard follows the column rather than taste — `weight_kg`,
 * `distance_m` and `rpe` are DecimalFields (models.py:126, 129, 132) and take a
 * decimal keypad; `reps` and `duration_s` are whole numbers.
 */
const MEASURES = [
  { key: 'weight_kg', label: 'Weight (kg)', inputMode: 'decimal', step: 'any' },
  { key: 'reps', label: 'Reps', inputMode: 'numeric', step: '1' },
  { key: 'distance_m', label: 'Distance (m)', inputMode: 'decimal', step: 'any' },
  { key: 'duration_s', label: 'Duration (s)', inputMode: 'numeric', step: '1' },
  { key: 'rpe', label: 'RPE', inputMode: 'decimal', step: 'any' },
]

/* The two conversions, written out together because they are one round trip: a
   `datetime-local` box holds local wall-clock time with no zone on it, and the
   API wants an instant. Neither is reached unless the box was actually typed
   in — see `seedFrom` for why that matters. */

function toLocalInput(iso) {
  const at = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  )
}

function fromLocalInput(value) {
  return new Date(value).toISOString()
}

/** A timestamp the tool shows but nobody may move. */
function endedText(iso) {
  if (!iso) return 'Not ended'
  const at = new Date(iso)
  return (
    `${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}, ` +
    `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
  )
}

/** Every box's starting string, straight off the API's own answer.
 *
 * `String(value ?? '')` throughout, and the object this returns is kept for the
 * whole life of the editor: a field is **changed** only when its current string
 * differs from the string it was seeded with, and nothing else is ever sent.
 * That one rule is what stops a save from rewriting values nobody touched —
 * `weight_kg` comes back `"100.00"` and goes back `"100.00"`, byte for byte.
 *
 * `started_at` is the reason the rule is written down rather than assumed. A
 * `datetime-local` box cannot hold sub-second precision, so a round trip
 * through it would silently trim a stored `…:04.317Z`. Untouched means unsent,
 * and unsent means untrimmed (C7).
 */
function seedFrom(block) {
  return {
    started: toLocalInput(block.training_session_started_at),
    type: String(block.training_session_type ?? ''),
    movement: String(block.exercise_definition ?? ''),
    sets: block.performed_sets.map((set) =>
      Object.fromEntries(MEASURES.map(({ key }) => [key, String(set[key] ?? '')])),
    ),
  }
}

/** Correct one logged block: its session, its movement, and every set in it.
 *
 * Deliberately plain, and that is the whole design. It is a tool for writing
 * over a finished record — behind a warning and a two-tap gate — and looking
 * like the rest of the app is the last thing it should do. So: labels above
 * boxes, the columns as the database holds them, no per-side arithmetic, no
 * `20 + 2 × 60`, no live total, no `Worked`, no thumb-sized buttons, no icons.
 * The rest of the app reads a set; this rewrites the row underneath it.
 *
 * **Nothing here removes anything.** No × on a set, no "remove this set", no
 * "add a set", no way to detach a block from its session and no way to delete a
 * session. There is no affordance for it, and the server refuses it anyway
 * (chunk 01): the override header unlocks PATCH and nothing else.
 */
function RecordEditor({ block, catalogue, onDone, onCancel }) {
  // One id per editor, split per control, the way LoadingFields pairs its two.
  const id = useId()
  // The seed and the live values start as the same object and then part
  // company; the seed is never written to again.
  const [seed] = useState(() => seedFrom(block))
  const [form, setForm] = useState(seed)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setMeasure(index, key, value) {
    setForm((current) => ({
      ...current,
      sets: current.sets.map((set, at) => (at === index ? { ...set, [key]: value } : set)),
    }))
  }

  /** One PATCH per changed row, outermost first (C8).
   *
   * The session, then the block, then each set in list order — so the likeliest
   * refusal, a `started_at` moved past its own `ended_at`, stops before
   * anything inside the session has moved. Each step carries the words for what
   * it is, because a failure halfway through has to say which half landed.
   */
  function plan() {
    const steps = []

    const session = {}
    if (form.started !== seed.started) session.started_at = fromLocalInput(form.started)
    if (form.type !== seed.type) session.type = form.type
    if (Object.keys(session).length > 0) {
      steps.push({
        what: 'the session',
        path: `training-sessions/${block.training_session}/`,
        body: session,
      })
    }

    if (form.movement !== seed.movement) {
      steps.push({
        what: 'the movement',
        path: `performed-exercises/${block.id}/`,
        body: { exercise_definition: form.movement },
      })
    }

    form.sets.forEach((set, index) => {
      const body = {}
      for (const { key } of MEASURES) {
        if (set[key] === seed.sets[index][key]) continue
        // A blank box is null, exactly as it is in the log form: clearing a
        // weight makes the set a bodyweight one (models.py:126), it does not
        // make it zero. A filled one goes as the string exactly as typed and
        // never through Number(), so a decimal column is never handed a float.
        body[key] = set[key] === '' ? null : set[key]
      }
      if (Object.keys(body).length > 0) {
        steps.push({
          what: `set ${index + 1}`,
          path: `performed-sets/${block.performed_sets[index].id}/`,
          body,
        })
      }
    })

    return steps
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const steps = plan()
    // Nothing changed: close, having done nothing. Save is live rather than
    // disabled — a form whose Save turns out to have nothing to do is kinder
    // than a dead button the reader has to work out.
    if (steps.length === 0) {
      onCancel()
      return
    }

    setBusy(true)
    setFailure(null)
    let done = 0
    try {
      for (const step of steps) {
        // api.correct throughout, including when the row happens to be open:
        // the header is never required and never harmful, and one code path is
        // worth more than a branch about state the client cannot see.
        await api.correct(step.path, step.body)
        done += 1
      }
      onDone()
    } catch (error) {
      console.error(error)
      // What landed and what did not, because "could not save" stops being the
      // truth the moment the session has already moved. Nothing is rolled
      // back: naming the step is the whole of the recovery story, and the
      // typed values stay on screen so the save can be tried again.
      const saved = steps.slice(0, done).map((step) => step.what)
      setFailure(
        (saved.length > 0
          ? `Saved ${saved.join(', ')}, but could not save ${steps[done].what}. `
          : `Could not save ${steps[done].what}. `) + (error?.detail ?? 'Please try again.'),
      )
      setBusy(false)
    }
  }

  return (
    <form className="record-editor" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Session</legend>
        <p className="add-exercise-field">
          <label htmlFor={`${id}-started`}>Started</label>
          <input
            id={`${id}-started`}
            type="datetime-local"
            // Seconds, because the column holds them and a box a second coarser
            // than the record would trim one every time it was opened.
            step="1"
            disabled={busy}
            value={form.started}
            onChange={(event) => setField('started', event.target.value)}
          />
        </p>
        <p className="add-exercise-field">
          <label htmlFor={`${id}-type`}>Type</label>
          <input
            id={`${id}-type`}
            // A text box and not a menu: `type` lost its choices in migration
            // 0004 and is free text with a max_length of 8, so a dropdown here
            // would reinvent a list the model deliberately does not have (C7).
            type="text"
            maxLength={8}
            disabled={busy}
            value={form.type}
            onChange={(event) => setField('type', event.target.value)}
          />
        </p>
      </fieldset>

      <fieldset>
        <legend>Exercise</legend>
        <p className="add-exercise-field">
          <label htmlFor={`${id}-movement`}>Movement</label>
          {/* The reason this whole section exists, so it is the one control
              that is not squeezed. A read of the catalogue and nothing more:
              no rename, no bar, no sides, no way to add an entry from here. */}
          <select
            id={`${id}-movement`}
            className="record-editor-movement"
            disabled={busy}
            value={form.movement}
            onChange={(event) => setField('movement', event.target.value)}
          >
            {catalogue.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </p>
        {/* Text, never a box: `ended_at` is read-only on the serializer
            (serializers.py:141) and stays that way. It is the block's own —
            `recent/` carries that one and not the session's — and it is here
            rather than under Session for that reason. */}
        <p className="add-exercise-field record-editor-read">
          <span className="record-editor-read-label">Ended</span>
          <span>{endedText(block.ended_at)}</span>
        </p>
      </fieldset>

      <fieldset>
        <legend>Sets</legend>
        <ol className="record-editor-sets">
          {form.sets.map((set, index) => (
            <li key={block.performed_sets[index].id}>
              <span className="record-editor-set-number">{index + 1}</span>
              <span className="record-editor-measures">
                {MEASURES.map(({ key, label, inputMode, step }) => (
                  <span className="add-exercise-field" key={key}>
                    <label htmlFor={`${id}-set-${index}-${key}`}>{label}</label>
                    <input
                      id={`${id}-set-${index}-${key}`}
                      type="number"
                      inputMode={inputMode}
                      step={step}
                      disabled={busy}
                      value={set[key]}
                      onChange={(event) => setMeasure(index, key, event.target.value)}
                    />
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </fieldset>

      <p className="record-editor-actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {/* Cancel throws the typed values away and asks nothing first: nothing
            was written, so there is nothing to confirm. */}
        <button className="button" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </p>

      {failure && (
        <p className="status" data-state="error">
          {failure}
        </p>
      )}
    </form>
  )
}

function RecentBlocks() {
  // A bare array from the API (chunk 02), so api.get rather than api.list:
  // thirty, newest first, and there are no pages to walk. Its own component so
  // the fetch happens on arming rather than on every visit to Settings, and so
  // disarming throws the list away.
  //
  // `reloads` is what a finished save bumps: the list re-reads itself, so it
  // shows what was actually stored rather than what was typed.
  const [reloads, setReloads] = useState(0)
  const {
    state,
    data: blocks,
    error,
  } = useLoad(() => api.get('performed-exercises/recent/'), [reloads])
  // Read once for the whole armed section rather than once per row: thirty rows
  // would otherwise be thirty reads of a catalogue that does not change.
  const { state: catalogueState, data: catalogue } = useLoad(() => api.list('exercises/'))
  // One row is open at a time.
  const [openId, setOpenId] = useState(null)

  return (
    <>
      <Status state={state} error={error} />
      {catalogueState === 'error' && (
        <p className="status" data-state="error">
          Could not load the exercise list, so nothing here can be opened.
        </p>
      )}

      {state === 'ready' &&
        (blocks.length === 0 ? (
          <p className="status">Nothing logged yet.</p>
        ) : (
          <ul className="edit-data-list">
            {blocks.map((block) => (
              <li key={block.id}>
                {block.id === openId ? (
                  // In place, inside the same <li>, the way a set being
                  // corrected nests its form in its own row: the block keeps
                  // its place in the list and nothing below it jumps.
                  <RecordEditor
                    block={block}
                    catalogue={catalogue}
                    onDone={() => {
                      setOpenId(null)
                      setReloads((count) => count + 1)
                    }}
                    onCancel={() => setOpenId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    // Until the catalogue is here there is no Movement menu to
                    // put in the editor, so there is nothing to open.
                    disabled={catalogueState !== 'ready'}
                    onClick={() => setOpenId(block.id)}
                  >
                    {blockLabel(block)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </>
  )
}

function EditDataSection() {
  const { armed, arm, disarm } = useEditGate()
  const [confirming, setConfirming] = useState(false)

  return (
    <section className="edit-data">
      <h2>Edit training data</h2>
      {/* Always on screen, armed or not: a warning you have to open first is
          not a warning. */}
      <p className="edit-data-warning">
        Everything this app can tell you about your training — what is going up, what a
        session cost you, what worked — it reads out of these records. A record changed into
        something you did not actually do does not just get that day wrong. It bends every
        comparison drawn through it afterwards, quietly, and nothing here will remember which
        numbers were real.
      </p>
      <p className="edit-data-warning">
        Change a record only to make it match the training that happened.
      </p>

      {armed ? (
        <>
          <p className="edit-data-state">
            Editing is on. It turns off when you reload, log out, or after 15 minutes.
          </p>
          <button className="button" type="button" onClick={disarm}>
            Turn off editing
          </button>
          <RecentBlocks />
        </>
      ) : confirming ? (
        // busy is false and passed anyway: arming is local, nothing is in
        // flight, and Confirm is not being changed to make the prop optional.
        <Confirm
          question="Turn on editing?"
          verb="Turning on"
          busy={false}
          onConfirm={() => {
            arm()
            setConfirming(false)
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button className="button" type="button" onClick={() => setConfirming(true)}>
          Turn on editing
        </button>
      )}
    </section>
  )
}

export default function Settings() {
  useDocumentTitle('Settings — Gym App')
  const { logOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // The only account action so far. It stays a POST rather than a link so a
  // prefetch or a stray GET cannot end someone's session.
  async function handleLogOut() {
    setBusy(true)
    setFailed(false)
    try {
      await logOut()
      navigate('/')
    } catch (error) {
      console.error(error)
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <button className="button" type="button" onClick={handleLogOut} disabled={busy}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
      {failed && (
        <p className="status" data-state="error">
          Could not log out. Please try again.
        </p>
      )}

      {/* An account action belongs with the other account action, and the
          list of notes reads last. */}
      <ExportSection />

      {/* Its own component, so a failed load is the section's problem and Log
          out above it keeps working. */}
      <LoggedNotes />

      {/* Last on the page. Log out and the download are things you came to
          Settings to do; this is a workshop door. */}
      <EditDataSection />
    </>
  )
}
