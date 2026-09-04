import { useEffect, useState } from 'react'
import { Navigate, useMatch, useNavigate } from 'react-router-dom'

import { ApiError, api } from '../api.js'
import AddExerciseForm, { insertByName } from '../components/AddExerciseForm.jsx'
import LoadingFields, { EMPTY_LOADING, loadingAnswered } from '../components/LoadingFields.jsx'
import Status from '../components/Status.jsx'
import Worked from '../components/Worked.jsx'
import { useDocumentTitle, useLoad } from '../hooks.js'
import { entryPrefix, loadingOf, perSide, setParts, setSummary, totalFrom, weightText } from '../sets.js'

/** The dropdown's last option: not an exercise, but the way to add one.
 *
 * A sentinel rather than an id, and one that no catalogue row can collide with:
 * every other value in that <select> is a UUID. It is read and thrown away by
 * the change handler — it must never reach the request that opens an exercise,
 * where a value matching no catalogue row would come back a 400 and put an
 * error line where a movement should be.
 */
const ADD_NEW = 'new'

/** The half-typed set, mirrored into the browser (E10).
 *
 * The first and only thing this app keeps on the device, and deliberately the
 * smallest thing it could be: the two strings sitting in the weight and reps
 * boxes, scoped to the block they were typed into.
 *
 * **A7 stands.** The log itself is never in `localStorage`. Every set reaches
 * the API as it is logged and the open exercise is a row on the server (E8), so
 * the only thing kept here is what has not been submitted yet. There is nothing
 * to sync, nothing to reconcile, and nothing lost when the storage is empty,
 * blocked, or belongs to another device.
 *
 * This overturns Z6 for restored drafts only — history still never seeds a box,
 * and never will. What comes back is what this user typed, on this device, into
 * this exercise, and it comes back visibly marked (`data-restored`, and the
 * line beside the boxes). That marking is not decoration: Z6's objection was
 * that a number the user did not type fails *silently*, and it is the whole
 * answer to it.
 *
 * All three of these touch `localStorage` inside try/catch and answer with
 * nothing when it throws. Private-mode Safari, a browser with site data blocked
 * and a full quota all throw on access, and a draft is a nicety: it must never
 * break the zone, never surface an error, and never stop a set being logged.
 */
const DRAFT_PREFIX = 'gym-app:draft-set:'

/** What was typed into this block before the page went away, or null.
 *
 * Keyed by the performed exercise, so a draft can never surface against a
 * different movement, a different session, or a second block of the same
 * movement (E7). Anything that is not an object of two strings reads as no
 * draft: a key from an older shape of this code, or one edited by hand, must
 * not put junk in a box.
 */
function readDraft(id) {
  try {
    const stored = window.localStorage.getItem(DRAFT_PREFIX + id)
    if (stored === null) return null
    const draft = JSON.parse(stored)
    if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) return null
    const weight = typeof draft.weight === 'string' ? draft.weight : ''
    const reps = typeof draft.reps === 'string' ? draft.reps : ''
    return weight === '' && reps === '' ? null : { weight, reps }
  } catch {
    return null
  }
}

/** Mirror the two boxes, as the strings they are.
 *
 * Exactly as typed, so a half-typed `62.` survives as a half-typed `62.` — the
 * same reason `weight` and `reps` are strings on the page rather than numbers.
 * Two empty boxes are not a draft, so the key is removed rather than written as
 * two empty strings; and every other draft key goes with it, because there is
 * one open exercise (E3) and a second key is always litter from a block that
 * closed on another device or in a tab that never came back.
 */
function writeDraft(id, weight, reps) {
  clearDrafts()
  if (weight === '' && reps === '') return
  try {
    window.localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ weight, reps }))
  } catch {
    // Quota, private mode, blocked site data. What is on screen is unaffected;
    // all that is lost is coming back to it.
  }
}

/** Every draft key, gone: the exercise closed, or a new draft is replacing it. */
function clearDrafts() {
  try {
    const keys = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key !== null && key.startsWith(DRAFT_PREFIX)) keys.push(key)
    }
    // Collected first and removed after: removing one while walking the index
    // shifts every key behind it down by one, and the walk skips the next.
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // Nothing to clear if the storage cannot be read in the first place.
  }
}

/** Whether a movement has ever said how it is loaded.
 *
 * Takes the `{ bar_kg, sides }` shape, which on this page is always
 * `loadingOf(openExercise)`: the open block carries its movement's loading in
 * the request that said an exercise was open, and carries it when `exercises/`
 * never arrived. Never a catalogue lookup — a zone that asked "how is this
 * loaded?" because the *catalogue* failed would be soliciting a permanent answer
 * on the strength of a network error.
 *
 * Both columns or neither (W1) — the database says so in
 * `exercisedef_loading_both_or_neither` — and this asks about both anyway, for
 * the reason `sets.js` gives where it asks the same question: a reader that
 * tests one is a reader that renders `undefined` the day the other goes missing.
 *
 * It is here rather than imported because `sets.js` asks it privately, on the
 * way to deciding how a set *reads*, and this page asks it about something else
 * entirely — whether there is a question to put to the user. Neither of those is
 * the other's rule, and the shape of "unset" they share is one line of `!= null`
 * rather than an arithmetic rule with a home. Nothing here formats, divides or
 * multiplies anything; all of that stays in `sets.js`.
 */
function loadingKnown(loading) {
  return (
    loading.bar_kg !== null &&
    loading.bar_kg !== undefined &&
    loading.sides !== null &&
    loading.sides !== undefined
  )
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
 *
 * `rows` is absent for the same list, and means the set is a record rather than
 * something to act on: the row is the numbers and nothing else (E6). Every
 * exercise under Completed exercises is closed, so Edit and Delete down there
 * would be controls the API now refuses.
 *
 * `loading` is how the movement is loaded, and one value serves both cells:
 * last time's set and this session's are the same movement by construction —
 * the comparison would mean nothing otherwise — so there is deliberately not a
 * second loading for the second column.
 */
function SetRow({ set, number, scope, rows, lastTime, loading }) {
  // A row this session has not reached yet has no set to act on, so it has no
  // row identity either: nothing can be opened, armed or failed on it. Nor has
  // a row in a list rendered without actions at all.
  const row = set === null || rows === undefined ? null : `${scope}:${set.id}`
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
          {lastTime === null ? '—' : <Worked {...setParts(lastTime, loading)} />}
        </span>
      )}

      {set === null ? (
        // Last time went a set further than this session has. The dash is the
        // second most useful thing on the screen: one more to go.
        <span className="set-measures" data-none="">
          —
        </span>
      ) : rows?.open === row ? (
        // Nested in the <li> so the row keeps its number and its place: this is
        // the same set, being corrected, not a form standing in for it. The
        // boxes are labelled for a screen reader only — a visible label per box
        // would push the row onto a second line at phone width.
        //
        // The same 375px is why nothing of the zone's log form comes with the
        // per-side box: no `20 + 2 ×` beside it and no live total to its right
        // (05). The set says the whole expression again the moment Save closes
        // the row, which is where it was saying it before Edit was tapped.
        <form
          className="edit-set"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault()
            rows.save(row, set)
          }}
        >
          {/* The label is the only thing that can say what this box holds:
              the number means one side on a movement with an expression and the
              whole total on every other, and with no room for the arithmetic
              beside it a screen reader is all that will say which. */}
          <input
            aria-label={rows.perSideBox ? 'Weight per side (kg)' : 'Weight (kg)'}
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
          {/* The working a step behind the answer, so a row still reads as
              `140 kg × 8` at a glance and tells you what was on the bar when
              looked at properly. The cut is `sets.js`'s; the two tiers are the
              log form's own, worn by the same classes. */}
          <span className="set-measures">
            <Worked {...setParts(set, loading)} />
          </span>
          {rows !== undefined && (
            <span className="set-actions">
              <button
                className="set-action"
                type="button"
                // The row's own movement goes with it: the box is seeded from
                // the line this row was showing, which was rendered from
                // exactly this loading.
                onClick={() => rows.edit(row, set, loading)}
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
          )}
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
 * Both lists on this page come through here — the open exercise's own sets and
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
 *
 * `loading` is how this list's movement is loaded, handed straight down to every
 * row: one list is one exercise, so one loading covers all of it.
 */
function SetList({ sets, scope, rows, lastTime, loading }) {
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
            loading={loading}
          />
        )
      })}
    </ol>
  )
}

/** The one box a weight is typed into, and the movement's own arithmetic around it.
 *
 * The point of the whole feature: the number typed stops being the number that
 * had to be worked out. On a barbell the box takes **one side** and the form
 * finishes the sentence itself —
 *
 *     20 + 2 × [ 60 ]  = 140 kg
 *
 * — with `20` and `2 ×` standing there as plain text, because they are facts
 * about the movement, fixed when it was added, and there is no edit path to them
 * from here or anywhere (AGREED 2). Nothing in the row is focusable or tappable
 * but the box.
 *
 * Three shapes, and `entryPrefix` decides between them so that this form and the
 * lines the sets are read back on can never disagree:
 *
 * | The movement          | The row                                    |
 * |-----------------------|--------------------------------------------|
 * | not configured        | `Weight (kg)`, one plain box — as today    |
 * | `bar_kg` 0, `sides` 1 | `Weight (kg)`, one plain box — as today    |
 * | `sides` 1, bar > 0    | `Weight per side (kg)`: `25 +` box `= 85 kg`  |
 * | `sides` 2             | `Weight per side (kg)`: `20 + 2 ×` box `= 140 kg` |
 *
 * A movement nobody has answered keeps the plain box: unknown is not zero
 * (AGREED 5), so it behaves exactly as it did before any of this existed. This
 * component never asks about one — the question is the panel one state back
 * (07), and this is what stands there when it has been skipped, or when there
 * are already sets in the block.
 *
 * The visible `<label>` stays in all three — it is how every other box on this
 * page is labelled and it is what a screen reader reads. Only its words change.
 *
 * **This component owns the box's shape and none of its behaviour.** Its `id`,
 * its keypad, its placeholder, the label's words and what stands to either side
 * of it are this component's business; everything the box *does* is handed in:
 *
 * | Prop       | What it is                              | What the page passes    |
 * |------------|-----------------------------------------|-------------------------|
 * | `loading`  | `{ bar_kg, sides }`, the `sets.js` shape | `loadingOf(openExercise)` |
 * | `value`    | the string in the box                   | `weight`                |
 * | `restored` | whether that string came back from storage | `restored`           |
 * | `onChange` | called with the typed **string**        | `typeWeight`            |
 *
 * The last two are the whole reason the props read as they do. Main's weight box
 * is not a plain box: it carries `data-restored`, the marker saying this number
 * came back from the browser rather than off the keyboard (E10), and every
 * keystroke goes through `typeWeight`, which sets the box, clears that marker
 * and mirrors both boxes into `localStorage` on the keystroke itself. A version
 * of this component that invented its own `onChange` around `setWeight` would
 * compile, render, look right and silently delete the draft feature — nothing
 * written while the user types, nothing back after a reload, and no error
 * anywhere to notice it by. So there is exactly one copy of that rule and it is
 * not here.
 */
function WeightEntry({ loading, value, restored, onChange }) {
  const box = (
    <input
      id="set-weight"
      type="number"
      // The decimal keypad on a phone: plates come in halves — more so per side,
      // where the 2.5 kg plate on each end is 1.25 of the total.
      inputMode="decimal"
      step="any"
      min="0"
      // Blank is a bodyweight set, so this one is never required.
      placeholder="—"
      value={value}
      // The styling hook, in the way `data-armed` and `data-none` already are: a
      // number that came back from the browser must not look like one just
      // typed (E10). It is the caller's state, not this component's inference.
      data-restored={restored ? '' : undefined}
      // The typed string, straight out — never an event, and never a setter of
      // this component's choosing. `typeWeight` is on the other end of it.
      onChange={(event) => onChange(event.target.value)}
    />
  )

  const prefix = entryPrefix(loading)
  if (prefix === null) {
    return (
      <p>
        <label htmlFor="set-weight">Weight (kg)</label>
        {box}
      </p>
    )
  }

  // Recomputed from the box on every keystroke. `null` while it is blank or
  // half-typed, and then the right-hand side is simply empty: no `= 0 kg` and no
  // dash, because there is no total yet to claim. A blank box still logs a
  // bodyweight set exactly as it always did (W9) — it just has nothing to show.
  const total = totalFrom(value, loading)

  return (
    <p className="per-side">
      <label htmlFor="set-weight">Weight per side (kg)</label>
      <span className="per-side-row">
        <span className="per-side-fixed">{prefix}</span>
        {box}
        {/* The total on its own: passing no loading is "no expression", which is
            right here because the expression is already spelled out to the left
            of the box. It reads exactly as the set will once it is logged. */}
        <span className="per-side-total">
          {total === null ? '' : `= ${weightText(total, null)}`}
        </span>
      </span>
    </p>
  )
}

/** The one question the app asks about a movement nobody ever answered.
 *
 * Every entry added since this feature landed carries its own bar and side count
 * (06), and the migration answered every movement it recognised. What is left is
 * the handful the app genuinely knows nothing about — and the place that comes
 * up is here, standing in front of the machine, about to log the first set into
 * it. So this is where it is asked, and nowhere else: no banner, no catalogue
 * page, no settings screen.
 *
 * It stands **in place of** the log form rather than beside it, because the box
 * it replaces would otherwise be asking for a number whose meaning has not been
 * settled yet. Everything under it — last time, the comparison, the Earlier
 * lines — stays exactly where it was: that is the most useful thing on the
 * screen while somebody works out what the bar weighs.
 *
 * The fields are `LoadingFields`, the same two questions in the same words the
 * add form asks (06), because they are the same two questions — and the note
 * under them says the answer is permanent, because it is: there is no edit path
 * to a loading from here or from anywhere (AGREED 2).
 *
 * **And it can be declined, in one tap.** That is the one thing this panel must
 * not get wrong. The question is a convenience the app is asking for; it is not
 * a toll on the way to logging a set, and nothing may stand between somebody and
 * their workout — the whole reason this feature exists is not wanting to think
 * in the gym. So "Not sure" drops straight to the plain total box this movement
 * has always had, and the set is logged exactly as it is logged today.
 *
 * Declining **stores nothing**. No flag, no dismissal, no "do not ask again":
 * the row stays unanswered, and the question comes back the next time the
 * movement is *picked up*, which under E2/E7 means the next block. That is the
 * entire cost of skipping it, and the entire mechanism — it is one boolean
 * belonging to this block, dropped with everything else in `closeExerciseRow`.
 * It is also why declining takes nothing away from "set once, then fixed
 * forever": a skip writes no value, so a loading still only ever goes
 * unknown -> known (AGREED 2, AGREED 5, W6).
 *
 * It is not asked again inside the block either, by tapping about or by
 * reloading: the skip holds until the block closes, and once a set is logged
 * W12 holds instead — the question is only ever put into a block with nothing in
 * it, because a block with a set in it has answered it the other way already.
 *
 * **Enter saves.** Lifecycle E11 took Enter away from the *log* form because
 * Enter there logged a set nobody meant to log; there is no set here, and the
 * inline edit form in a set row kept its Enter for the same reason. So this
 * stays a `<form>` with an `onSubmit`, and Enter in the Bar (kg) box does what
 * the button beside it does.
 *
 * Change exercise sits here for the same reason it sits on the log form: there
 * is never a state with an exercise open and no visible way back to the
 * dropdown, and a mis-tap must not need the zone closed to undo. It is
 * `closeExerciseRow`, a request now rather than the local `releaseExercise` this
 * panel was first written against — so it waits, it says `Changing…` while it
 * does, and it gets an error line of its own. It always takes that request's 204
 * path, because W12 means the block is empty: the row is deleted as though the
 * movement had never been picked (E5) and the user lands back on the chooser.
 * There is no Log exercise wording to render here and no branch for it.
 */
function AskLoading({
  value,
  onChange,
  onSave,
  onSkip,
  onClose,
  busy,
  closing,
  failure,
  closeError,
}) {
  return (
    <section className="ask-loading">
      <h3>How is this loaded?</h3>
      {/* One sentence, and it is the *why*: a question that appears out of
          nowhere in front of somebody mid-workout has to say what prompted it.
          That the answer is permanent is said under the boxes instead, by
          `LoadingFields`' own note — the same words the add form uses, which is
          the entire reason that note lives in the shared component. Saying it
          twice on one panel would make it nag, and this panel must not nag. */}
      <p className="ask-loading-why">The app does not know how this one loads yet.</p>

      <form
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault()
          onSave()
        }}
      >
        <div className="ask-loading-fields">
          {/* Frozen while the request is in flight, unlike the add form's pair:
              there is no name box here to keep live beside them, and a save that
              lands while the answer is being changed would store the old one. */}
          <LoadingFields value={value} onChange={onChange} disabled={busy} />
        </div>

        <div className="ask-loading-actions">
          <button
            className="button button--tap"
            type="submit"
            disabled={!loadingAnswered(value) || busy || closing}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {/* The way past the question, and it is one tap from here to a logged
              set. Quiet, because it is the lesser answer — the app learns
              nothing and asks again next time — but plainly offered and worded
              as a choice rather than as a failure to have one. It is not a
              submit: nothing is sent, nothing is stored, and there is nothing
              to go wrong with it. */}
          <button
            className="skip-loading"
            type="button"
            onClick={onSkip}
            disabled={busy || closing}
          >
            Not sure — just log the total
          </button>
          {/* A request, and the only way out of the block from here. Off while
              the answer is saving as well as while it is closing: two writes
              about the same block, one of which deletes it, must not be in
              flight together. */}
          <button
            className="change-exercise"
            type="button"
            onClick={onClose}
            disabled={busy || closing}
          >
            {closing ? 'Changing…' : 'Change exercise'}
          </button>
        </div>

        {/* Under the button that was tapped, with both answers still in the
            boxes: the movement is still unanswered, so the question is still
            there to answer. */}
        {failure && (
          <p className="status" data-state="error">
            {failure}
          </p>
        )}
        {/* The same line the log form gives a failed close, in the same place
            and the same words: the panel is left exactly as it was, typed
            answer and all. */}
        {closeError && (
          <p className="status" data-state="error">
            {closeError}
          </p>
        )}
      </form>
    </section>
  )
}

/** The typed entry as the API wants it, or `null` when it is not a set yet.
 *
 * Reps are required and whole and positive (A5) — a set of `0` or `-3` records
 * nothing.
 *
 * Weight is optional, because bodyweight movements have none, and a **blank box
 * is `null` rather than `0`**: no weight is not zero weight. That still holds on
 * a movement with a 20 kg bar, where the temptation to read an empty box as
 * "just the bar" is real — it would write down a set nobody did (W9). A blank
 * box logs a bodyweight set on deadlift exactly as it does on pull ups.
 *
 * `loading` is how the movement being recorded is loaded — `{ bar_kg, sides }`,
 * which on this page is `loadingOf(openExercise)`, off the block itself and
 * never off a catalogue row. When it says nothing, or says `0 / 1`, the box holds
 * the total and its string is passed straight through, so `62.5` reaches a
 * decimal column without a float rounding it first: unchanged behaviour, and
 * `totalFrom` keeps it that way. Otherwise the box holds one side and the total
 * is `bar_kg + sides × it`, computed in `sets.js` and sent as `"140.00"`. The
 * components themselves are never sent: `weight_kg` is the whole record of a set
 * and stays the only thing stored (AGREED 3).
 */
function parseEntry(weight, reps, loading) {
  if (!/^\d+$/.test(reps.trim()) || Number(reps) < 1) return null

  const typedWeight = weight.trim()
  if (typedWeight === '') return { weight_kg: null, reps: Number(reps) }
  // A half-typed weight is a mistake, not a bodyweight set — and so is a per
  // side that makes a total finer than the column can hold.
  const total = totalFrom(typedWeight, loading)
  if (total === null) return null
  return { weight_kg: total, reps: Number(reps) }
}

/** What a row being corrected puts in its box, and what that number means.
 *
 * One rule decides all of it: **the box edits whatever the row was showing.**
 * A row reading `20 + 2 × 60 = 140 kg` opens holding `60`, typed per side; a row
 * reading a plain `50 kg` opens holding `50`, typed as a total, exactly as every
 * box on this page did before. Never a box whose number means something the line
 * above it did not say.
 *
 * That one sentence is also the whole of the awkward cases, which is why none of
 * them has a branch here. `entryPrefix` and `perSide` have already made this
 * decision once, for the line the row rendered, so asking them again is what
 * keeps the two answers the same answer — a `0 / 1` stack, a movement nobody has
 * configured, a total lighter than its own bar and a total that will not divide
 * all say "there is no expression" to one of them, and all get today's box back.
 *
 * The `loading` handed back is the one `parseEntry` is given, so `null` there is
 * literally "this box holds the total": the string it was typed as goes to the
 * API untouched, which is the behaviour those rows have always had.
 *
 * A set that carried no weight opens with an empty box whatever the movement is
 * (W9), and leaving it empty leaves it a bodyweight set — but on a configured
 * movement it is still a *per side* box, because that is the box that movement
 * is logged in, and a number typed into it has to mean the same thing in both
 * places.
 *
 * This function and its three call sites are the whole of AGREED 9, which is an
 * assumption rather than something asked for. Seeding
 * `String(Number(set.weight_kg))` with a `null` loading is this chunk undone.
 */
function editedIn(set, loading) {
  const side = set.weight_kg === null ? '' : perSide(set.weight_kg, loading)
  if (side !== null && entryPrefix(loading) !== null) return { value: side, loading }
  // Through Number so a decimal column's "60.00" reads back as it was typed.
  return { value: set.weight_kg === null ? '' : String(Number(set.weight_kg)), loading: null }
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
 * user deleted a set, not the movement, and an open exercise is a place they
 * are still standing in. Emptying it is how a mis-picked movement is undone —
 * the way out flips back to Change exercise, which closes the block and, having
 * nothing in it, removes it (E5). That is a tap the user makes, not one made
 * behind their back here.
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
 * A set can be on screen twice at once: the open exercise's list and Completed
 * exercises are the same sets rendered in two places. So a row is named by the
 * list it is in as well as by its set — `held:<id>` — or opening Edit in one
 * would open the same set in the other. The zone's scope keeps its old name;
 * it is a namespace for row ids and nothing reads it as a word.
 *
 * That collision cannot happen any more: Completed exercises has no Edit and no
 * Delete (04), so the zone's list is the only one with rows in it. The scope
 * stays — it costs nothing, and a row id that says which list it belongs to is
 * still the honest name for it.
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

  // What the open row's box is typed in — `{ row, loading }`, or nothing open.
  // A `null` loading in it means the box holds a plain total, which is what
  // `editedIn` seeds for every row without an expression.
  //
  // It has to be state, and it is carried per row — though the argument for
  // that is weaker than it was, and it is worth saying so rather than leaving a
  // comment that has quietly stopped being true. This hook used to serve two
  // lists, so two rows opened one after the other could be different movements;
  // lifecycle 04 took Edit and Delete off Completed exercises, so it now serves
  // exactly one list, which is one movement. The loading could therefore be
  // handed in once instead of per row — and is not, because the hook would then
  // have to be told which exercise it is serving. Keeping it on `edit` costs one
  // argument, keeps the hook ignorant of which list it is in (which is what let
  // it serve two, and what would let it serve two again), and is where
  // `perSideBox` below comes from. The row travels beside it so it is dropped
  // with the rest of that row's state, the way `failure` already is.
  const [typedIn, setTypedIn] = useState(null)

  // The same rule as logging a set, from the same function: reps required and
  // positive, a blank weight meaning bodyweight rather than zero (A5).
  //
  // On a row being corrected per side, the loading is what multiplies the box
  // back up into the total that is sent — the exact inverse of the division
  // `edit` seeded it with. On every other row it is `null`, and the string that
  // was typed goes through untouched, exactly as it always has.
  const entry = parseEntry(weight, reps, typedIn?.loading ?? null)

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

  /** Open a row, seeded with what it was showing — closing whatever was open.
   *
   * `loading` is the movement the row belongs to, handed in by `SetRow` from the
   * same prop its line was rendered from. `editedIn` turns the two into the
   * number that goes in the box and what that number means; nothing here needs
   * to know which of them it got.
   */
  function edit(row, set, loading) {
    const box = editedIn(set, loading)
    setOpen(row)
    setTypedIn({ row, loading: box.loading })
    setWeight(box.value)
    setReps(set.reps === null ? '' : String(set.reps))
    setArmed(null)
    setFailure(null)
  }

  /** Put the row back as it was. Nothing was sent, so there is nothing to undo. */
  function cancel() {
    setOpen(null)
    setTypedIn(null)
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
      setTypedIn(null)
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
    setTypedIn((current) => (inScope(current?.row) ? null : current))
    setArmed((current) => (inScope(current) ? null : current))
    setFailure((current) => (inScope(current?.row) ? null : current))
  }

  return {
    open,
    armed,
    weight,
    setWeight,
    // Which of the two things the weight box holds, for the label that is the
    // only place it is said out loud. True exactly when `editedIn` kept a
    // loading, i.e. when the row it opened was showing an expression.
    perSideBox: Boolean(typedIn?.loading),
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
 *
 * Its sets are a record and are rendered as one: no `rows`, so no Edit and no
 * Delete. Everything down here is closed by definition — the open exercise is
 * up in the zone — and the API refuses every write to a closed block (E6), so
 * the buttons would be controls that fail. Correcting a set that has been
 * logged is Django admin's job now, by choice.
 */
function PerformedExercise({ performed, index }) {
  return (
    <li className="performed">
      <h3>
        {index}. {performed.exercise_name}
      </h3>

      {/* The catalogue is not consulted here, and this page's copy of it is not
          read either: chunk 02 hung the loading on the performed exercise so
          that a list of many different movements can show each one's own
          arithmetic without a lookup per row. */}
      <SetList
        sets={performed.performed_sets}
        scope="completed"
        loading={loadingOf(performed)}
      />
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
  // Flipped in the same effect, so the two are always read together. `state`
  // says the request is answered; `session` catches up a render later, and the
  // redirects below have to wait for the second of those — one that only
  // waited for `state` would read `session === null` in the gap and bounce a
  // real session out of the exercise address.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (state !== 'ready') return
    setSession(data)
    setLoaded(true)
  }, [state, data])

  // The same move, for the same reason: the loaded catalogue becomes the page's
  // own list, so an exercise added from the dropdown below is in it from then on
  // without `exercises/` being read again (N11).
  const [catalogue, setCatalogue] = useState(null)
  useEffect(() => {
    if (catalogueState === 'ready') setCatalogue(catalogueData)
  }, [catalogueState, catalogueData])

  // The exercise being recorded into — the one row in this session the server
  // has not closed yet (E1, E8). Derived, never stored: `current/` answers with
  // the detail serializer, so the open block and every set in it are already in
  // the one request this page makes on mount. That is the whole restore. A
  // reload, a tab switch or a browser reopened the next morning lands back
  // inside the exercise with no second request and no second copy of the truth,
  // and there is nothing here that a refresh can drop.
  const openExercise =
    session?.performed_exercises.find((performed) => performed.ended_at === null) ?? null
  // Addressed by the block's own id rather than by its movement: a session may
  // hold two blocks of the same exercise (E7), and a `.find` on the definition
  // would answer with the first of them for ever.
  const openSets = openExercise?.performed_sets ?? []

  // Whether the dropdown has been swapped for the add form. Only ever read
  // where nothing is open: the chooser is the state of the zone in which there
  // is no exercise, and the add form is a state of the chooser.
  const [adding, setAdding] = useState(false)

  // The name of the movement a typed one turned out to already be, for the
  // quiet line under it while it is being recorded (N5). It belongs to this
  // block: it is dropped when the exercise closes.
  const [alreadyThere, setAlreadyThere] = useState(null)

  // The typed-but-unsent answer to "how is this loaded?" for a movement that has
  // never said (07). Blank and never defaulted, for the reason `LoadingFields`
  // gives: the answer cannot be corrected afterwards, so a default is a wrong
  // answer nobody typed. It belongs to this block and is dropped with it.
  const [loadingAnswer, setLoadingAnswer] = useState(EMPTY_LOADING)
  const [savingLoading, setSavingLoading] = useState(false)
  const [loadingError, setLoadingError] = useState(null)
  // Somebody answered it first — another tab, another phone — and this block took
  // their answer. A quiet line rather than an error, for the same reason
  // `alreadyThere` is one: nothing went wrong.
  const [loadingRaced, setLoadingRaced] = useState(false)
  // The question, declined — for this block and only for this block.
  //
  // Transient by design, and transient is the only design allowed here: it
  // stores nothing, sends nothing and is written nowhere, so the catalogue row
  // stays unanswered and the question comes back the next time that movement is
  // picked up, which under E2/E7 is the next block. There is deliberately no "do
  // not ask again" and no dismissal record. A skip is somebody saying "not now",
  // which is a different sentence from "never", and the only way to say the
  // second one is to answer.
  const [loadingSkipped, setLoadingSkipped] = useState(false)

  // The zone's fourth state: an open exercise that has never said how it is
  // loaded, and the one question about it. Not a fourth sibling of
  // dropdown / adding / open — it is a state *of* the open exercise, so the
  // heading is still the movement's name, the address is still
  // /current-session/exercise and the history below is still there. What it
  // replaces is the log form.
  //
  // Four clauses, and each is load-bearing:
  //
  // - `loadingOf(openExercise)` — off the block, never a catalogue lookup. The
  //   block carries `exercise_bar_kg` and `exercise_sides` itself (chunk 02) and
  //   carries them when `exercises/` never loaded; asking because the *catalogue*
  //   failed would be soliciting a permanent answer off a network error.
  // - `loadingKnown` is the W1 test, both columns, for the reason it gives.
  // - `openSets.length === 0` is W12. A block with a set in it has answered this
  //   question the other way already. Without it, every reload of an exercise
  //   somebody skipped puts the question back in front of them with their own
  //   sets on the screen behind it — the wall W10 exists to forbid, re-erected
  //   by the one thing the last iteration went to trouble to make survive.
  // - `loadingSkipped` is the skip, above.
  const asking =
    openExercise !== null &&
    !loadingKnown(loadingOf(openExercise)) &&
    openSets.length === 0 &&
    !loadingSkipped

  // Where the user is (E9). The zone is an address rather than a boolean:
  // /current-session/exercise is the exercise, /current-session is the workout,
  // and this one line is what used to be `choosing`. It survives a reload, the
  // back gesture is a real step out of it, and a link into it lands where the
  // user was.
  const atExercise = useMatch('/current-session/exercise') !== null
  const navigate = useNavigate()


  // Opening one is a request now (E2, A9), so it has a wait and a failure of
  // its own — both of which belong beside the chooser that started them.
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState(null)

  // And so is leaving one (E5): the same two, for the one control that closes
  // the block.
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState(null)

  // What was done to this movement before today: fetched once, when it is
  // picked (Z5), and refetched only when a different one is (03). Not after
  // logging a set — the endpoint's answer cannot have changed, because the only
  // new sets are this session's, and those are on screen already.
  //
  // `exclude_session` is not optional. Without it the running workout becomes
  // its own "last time" the moment a second set goes in, and both columns show
  // the same numbers. With no exercise open there is nothing to ask, so the
  // loader answers `null` rather than firing a request.
  //
  // Keyed on the movement rather than on the block, so coming back to an
  // exercise later in the session (E7) shows the same three past sessions the
  // first block showed without asking for them again: it is the same movement,
  // and the running session is excluded from the answer either way.
  const history = useLoad(
    () =>
      openExercise === null || session === null
        ? Promise.resolve(null)
        : api.get(
            'performed-exercises/history/' +
              `?exercise_definition=${openExercise.exercise_definition}` +
              `&exclude_session=${session.id}` +
              '&limit=3',
          ),
    [openExercise?.exercise_definition],
  )
  // Newest trained first, so last time is the head of it and the two behind it
  // are the Earlier lines (04) — the same three the one request already
  // brought back (Z7), never a second ask. Fewer than three trained sessions
  // simply makes this shorter, or empty.
  const lastTime = history.data?.[0] ?? null
  const earlier = history.data?.slice(1) ?? []

  // What is about to be logged. Kept as typed rather than as numbers, so an
  // empty box stays empty and a decimal point survives being typed. It outlives
  // a successful log on purpose (below); only closing the exercise clears it,
  // since what was typed belonged to that movement.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  // The loading comes off the open block, which carries `exercise_bar_kg` and
  // `exercise_sides` from the moment it exists (chunk 02) — not out of the
  // catalogue, which this page no longer derives the open exercise from and
  // which is not there at all when `exercises/` failed to load. On a configured
  // movement the box holds one side and this is where it becomes the total that
  // is sent; on every other one it holds the total, as it always did.
  const entry = parseEntry(weight, reps, loadingOf(openExercise))

  // Whether what is in the boxes came back from `localStorage` rather than from
  // the keyboard (E10). It is the mitigation Z6 asked for, so it is state of its
  // own rather than something inferred: while it is true the boxes say so, and
  // it goes the moment the user touches either of them or logs a set.
  const [restored, setRestored] = useState(false)

  // Arriving at a block reads its draft, once. Keyed on the block's id, so it
  // fires on the mount that lands back inside an exercise after a reload and on
  // nothing else: typing afterwards is typing, not restoring, and this must
  // never fight the user for a box they are in the middle of.
  //
  // A brand-new exercise has a brand-new id and therefore no key, so its boxes
  // are empty. That is Z6 exactly as it always was — nothing seeds a box from
  // history, from last time, or from the set just logged.
  useEffect(() => {
    if (openExercise === null) return
    const draft = readDraft(openExercise.id)
    if (draft === null) return
    setWeight(draft.weight)
    setReps(draft.reps)
    setRestored(true)
  }, [openExercise?.id])

  /** Type into a box: the boxes are the truth, and the draft mirrors them.
   *
   * Written on the change itself rather than from an effect or a timer — two
   * short strings cost less than the machinery that would avoid writing them,
   * and a write that has already happened is one a locked phone cannot
   * interrupt. Typing is also what makes a restored number the user's own
   * again: the marker goes here, and the values stay.
   */
  function typeWeight(typed) {
    setWeight(typed)
    setRestored(false)
    if (openExercise !== null) writeDraft(openExercise.id, typed, reps)
  }

  function typeReps(typed) {
    setReps(typed)
    setRestored(false)
    if (openExercise !== null) writeDraft(openExercise.id, weight, typed)
  }

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

  /** Save the typed set: one request, then straight into `session`.
   *
   * The `PerformedExercise` exists before a single set is logged into it now —
   * choosing the movement is what created it (E2) — so there is no lazy create
   * here any more and no branch on whether the block is there. It is, or the
   * user is not on this screen.
   *
   * Not a submit handler: the boxes are not in a <form>, so Enter in either of
   * them does nothing at all (E11). Logging a set is a tap on Log set, always,
   * which is half of "it submits without you realising" gone.
   *
   * Both lists redraw off `setSession` alone — there is one copy of the log on
   * this page, so nothing is wired between them and `current/` is not re-read.
   */
  async function logSet() {
    if (entry === null || logging) return

    setLogging(true)
    setLogError(null)
    try {
      const set = await api.post('performed-sets/', {
        performed_exercise: openExercise.id,
        ...entry,
      })
      setSession((current) => ({
        ...current,
        performed_exercises: current.performed_exercises.map((candidate) =>
          candidate.id === set.performed_exercise
            ? { ...candidate, performed_sets: [...candidate.performed_sets, set] }
            : candidate,
        ),
      }))
      // Weight and reps stay as they are: another set of the same thing is the
      // common case, and it should cost one tap. On a configured movement what
      // stays is the per-side number, which is the one most likely to be right
      // for the next set. The draft stays with them, deliberately — it mirrors
      // the boxes, and clearing it here would bring the page back emptier than
      // the screen the user was looking at.
      //
      // They are the user's numbers now whatever they were a moment ago: they
      // have been looked at and logged, so the restored marker goes.
      setRestored(false)
    } catch (failure) {
      console.error(failure)
      setLogError('Could not log that set. Please try again.')
    } finally {
      setLogging(false)
    }
  }

  /** An answered movement onto the session's rows, however it came to be answered.
   *
   * **This, and not the catalogue, is the re-render.** The zone reads
   * `loadingOf(openExercise)`, so the answer is folded onto the performed
   * exercises as the two fields `PerformedExerciseSerializer` names, and `asking`
   * goes false on the next render with the per-side form (04) arriving already
   * knowing what to do with what is typed into it. Swapping a catalogue row
   * would change nothing on screen at all — nothing on this page reads `bar_kg`
   * or `sides` off the catalogue any more — and the failure would be silent: the
   * panel would simply sit there after a successful save.
   *
   * **Every block of that movement, not just the open one.** The predicate is
   * the movement, because a session may hold two blocks of the same one (E7):
   * skip it in the first block, log some sets, close it, pick it up again,
   * answer it — and the completed block down in Completed exercises has to start
   * reading `20 + 2 × 60 = 140 kg × 8` too. Matching `openExercise.id` would
   * leave one list on the page disagreeing with the other about the same
   * movement until a reload.
   *
   * `answered` is an `ExerciseDefinitionSerializer` row — `bar_kg` a decimal
   * string, `sides` a number — which is exactly the pair `loadingOf` reads.
   *
   * The answer belongs to the catalogue and not to this workout: no
   * `PerformedExercise` is created, no set is logged, no `ended_at` is written,
   * and not one request goes to `performed-exercises/`, `performed-sets/` or
   * `training-sessions/`. The write below is this page catching its own copies
   * up with the answer it just got back. Nothing is navigated and `exercises/`
   * is not read again — the response *is* the row (N11).
   */
  function foldLoading(answered) {
    setSession((current) => ({
      ...current,
      performed_exercises: current.performed_exercises.map((performed) =>
        performed.exercise_definition === answered.id
          ? { ...performed, exercise_bar_kg: answered.bar_kg, exercise_sides: answered.sides }
          : performed,
      ),
    }))
    // The page's other copy of the same movement, brought level in one line —
    // for hygiene, not for effect. It is not the mechanism: the fold above is,
    // and deleting it in the belief that one of the two is redundant would leave
    // the panel sitting there after a save that worked.
    setCatalogue((list) =>
      list === null ? list : list.map((entry) => (entry.id === answered.id ? answered : entry)),
    )
    setLoadingAnswer(EMPTY_LOADING)
    setLoadingError(null)
  }

  /** Answer the question, once and for all: `POST exercises/<id>/loading/`.
   *
   * A one-way door on both sides of the wire. The endpoint refuses a row that
   * already carries an answer, and this is the only place the client ever asks
   * it: a loading goes unknown -> known and never known -> different (AGREED 2,
   * W6). There is no edit path here to write, and none to add later.
   *
   * The 409 is the interesting case, and it is **not** a failure: it means
   * somebody answered this movement first, in another tab or on another phone,
   * and the body carries the row they wrote. That is an answer, so it is folded
   * in exactly as a 200 would be and the workout carries on. It is never
   * retried, never overwritten and never offered as a choice — their answer is
   * as final as ours would have been.
   */
  async function saveLoading() {
    if (!loadingAnswered(loadingAnswer) || savingLoading) return

    setSavingLoading(true)
    setLoadingError(null)
    try {
      // The catalogue id off the open block — the movement being recorded, which
      // is what the answer is about. The block is the only place this page still
      // looks a movement up from.
      const answered = await api.post(`exercises/${openExercise.exercise_definition}/loading/`, {
        // The bar as the string it was typed as, so a decimal column never sees
        // a float; the side count as the number the API asks for, off a control
        // that can only ever hold "1" or "2".
        bar_kg: loadingAnswer.bar_kg,
        sides: Number(loadingAnswer.sides),
      })
      foldLoading(answered)
    } catch (failure) {
      const settled =
        failure instanceof ApiError && failure.status === 409
          ? (failure.data?.exercise ?? null)
          : null
      if (settled) {
        setLoadingRaced(true)
        foldLoading(settled)
        return
      }
      console.error(failure)
      // The typed answer stays in the boxes and the movement stays unanswered:
      // a save that did not arrive changed nothing, here or on the server. The
      // skip is still sitting there for somebody who would rather not have this
      // conversation twice.
      setLoadingError('Could not save that. Please try again.')
    } finally {
      setSavingLoading(false)
    }
  }

  /** Decline the question, and get on with the workout.
   *
   * One tap, no request, nothing written. The log form comes back with the plain
   * total box this movement has always had, `parseEntry` passes the typed string
   * through untouched exactly as it did before any of this existed, and the set
   * is logged the way it is logged today.
   *
   * Nothing about the catalogue row changes, which is the point: the app has not
   * learned anything, so it asks again the next time this movement is *picked
   * up*, which under E2/E7 is the next block — not the next time this page
   * mounts. Within the block it stays skipped, through a reload as much as
   * through a tap, because a set logged into it makes W12 hold instead. That is
   * the whole cost of skipping, and there is no way to make it permanent — see
   * `loadingSkipped` above for why there must not be one.
   */
  function skipLoading() {
    setLoadingSkipped(true)
    // What was half-typed went with the question. Coming back to it — by closing
    // the block and picking the movement up again — starts from blank.
    setLoadingAnswer(EMPTY_LOADING)
    setLoadingError(null)
  }

  /** Open the exercise: the tap that means "I am doing this now" (E2).
   *
   * The row is written when the movement is picked, not when its first set is
   * logged, which is the whole complaint this iteration answers — the block
   * used to appear out of Log set, so the exercise "submitted without you
   * realising". It costs a round trip and the user waits for it (A9): there is
   * no optimistic row, because the thing being bought with the wait is knowing
   * that the exercise is really open.
   *
   * `openExercise` finds the appended row on the next render, so nothing else
   * has to be set for the zone to become the recording screen.
   *
   * `alreadyInCatalogue` is the name a typed one turned out to already be
   * (N5), and it is only said once the exercise is actually open — a failed
   * open must leave no note about a movement nothing is recording.
   */
  async function openExerciseRow(exerciseDefinition, alreadyInCatalogue = null) {
    if (opening) return

    setOpening(true)
    setOpenError(null)
    // The add form has done its job and must not be sitting there live while
    // the request it started is in flight (A9).
    setAdding(false)
    try {
      const created = await api.post('performed-exercises/', {
        training_session: session.id,
        exercise_definition: exerciseDefinition,
      })
      setSession((current) => ({
        ...current,
        // That serializer answers without `performed_sets`, and both lists read
        // it, so the empty array it stands for is filled in here.
        performed_exercises: [...current.performed_exercises, { ...created, performed_sets: [] }],
      }))
      setAlreadyThere(alreadyInCatalogue)
    } catch (failure) {
      console.error(failure)
      // Nothing was added to `session`, so the chooser is exactly as it was,
      // with the same movement one tap away.
      setOpenError('Could not open that exercise. Please try again.')
    } finally {
      setOpening(false)
    }
  }

  /** Close it, and let go of what was being typed into it (E5, E7).
   *
   * The one control at the bottom of the zone ends here whichever word it is
   * wearing, because both are the same request — and the answer says which act
   * it was. 204: there was nothing in it, so the block never happened and the
   * row is gone; back to the chooser, still in the zone. 200: it is in the log
   * with `ended_at` stamped; out of the zone.
   *
   * Either way it is final (E6). Coming back to the movement later starts a
   * second block rather than reopening this one, and the response is merged
   * over the stored row rather than replacing it — `end/` answers with the
   * plain serializer, which carries no `performed_sets`, and the sets it does
   * not mention are still the sets that were logged.
   */
  async function closeExerciseRow() {
    if (closing) return

    setClosing(true)
    setCloseError(null)
    try {
      const closed = await api.post(`performed-exercises/${openExercise.id}/end/`, {})
      setSession((current) => ({
        ...current,
        performed_exercises:
          closed === null
            ? current.performed_exercises.filter((candidate) => candidate.id !== openExercise.id)
            : current.performed_exercises.map((candidate) =>
                candidate.id === closed.id ? { ...candidate, ...closed } : candidate,
              ),
      }))
      // An empty block leaves the user where they are, on the chooser — the
      // address does not change because they have not left the exercise, they
      // have gone back to picking one. A logged one is done with, so it steps
      // out to the workout, where it is now in Completed exercises. Only on
      // success: the failure below leaves them here with the error and the
      // retry.
      if (closed !== null) navigate('/current-session')
      // All of it belonged to the movement just closed: a half-typed set, the
      // note about its name, and — the reason this is not just tidiness — a row
      // left open for editing or armed for deletion, which would be waiting
      // that way the next time the zone opens.
      setWeight('')
      setReps('')
      // Including the copy of it in the browser (E10): the draft belonged to
      // the block that just closed, and closing is final (E6), so there is
      // nothing left for it to come back to. Every draft key goes, not just
      // this one — at most one is ever wanted, and the rest are litter.
      clearDrafts()
      setRestored(false)
      setLogError(null)
      setAlreadyThere(null)
      // The question and everything this block had to do with it (07): a
      // half-typed answer must not be waiting for whoever opens the next
      // movement, and a skip is declined for this block and no longer — picking
      // the same movement up again is a new block, and it asks again.
      setLoadingAnswer(EMPTY_LOADING)
      setLoadingError(null)
      setLoadingRaced(false)
      setLoadingSkipped(false)
      rows.close('held')
    } catch (failure) {
      console.error(failure)
      // The zone stays exactly as it is, sets and all: a close that did not go
      // through must never blank the screen or lose a set.
      setCloseError('Could not close that exercise. Please try again.')
    } finally {
      setClosing(false)
    }
  }

  /** Adding a movement is choosing it: the zone goes straight to recording.
   *
   * The created row goes into the page's copy of the catalogue — so it is in
   * the dropdown for the rest of the session, with no second GET (N11) — and is
   * opened on the spot, which lands the zone in exactly the state choosing
   * anything else from the list lands it in: the name, an empty set list, the
   * weight and reps boxes.
   */
  function chooseCreated(created) {
    setCatalogue((list) => insertByName(list, created))
    openExerciseRow(created.id)
  }

  /** The name was already a movement, so that movement is the answer (N5).
   *
   * It is put into the list first if it is not in it — which happens when this
   * page loaded before somebody else added it. The catalogue *page* deliberately
   * does the opposite, because there the list is a table being read and a
   * missing row is a stale read that a reload fixes. Here the list is the
   * chooser, and a movement being recorded should be in it.
   */
  function chooseExisting(existing) {
    setCatalogue((list) =>
      list.some((entry) => entry.id === existing.id) ? list : insertByName(list, existing),
    )
    // Said quietly under the name, not as an error: what matters mid-workout is
    // that recording has started against the movement they meant.
    openExerciseRow(existing.id, existing.name)
  }

  /** Out of the chooser, having chosen nothing.
   *
   * The one way out of the zone that is not a request, because nothing was
   * opened: there is no row to close and nothing to undo. A half-typed add form
   * goes with it rather than being what the zone comes back to. A push, not a
   * replace — the chooser was somewhere the user went, and Back from the
   * workout can take them back to it.
   */
  function cancelChoosing() {
    setAdding(false)
    setOpenError(null)
    // Nothing of the question to clear here: the panel only exists once an
    // exercise is open, and everything it owns is dropped in `closeExerciseRow`.
    navigate('/current-session')
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
   * it was logged (A7). Dropping the session is the whole of it — the zone is
   * an address now rather than a flag on this page, and with no session there
   * is no open exercise to pin anyone to it.
   *
   * No rows are closed here any more. The zone's were cleared when the exercise
   * closed, which under E4 is the only way this page was reached, and Completed
   * exercises no longer has rows to leave open or armed (04).
   *
   * Nothing navigates either: End and Discard are only reachable from the
   * workout, so the user is already at /current-session and stays there. What
   * guards the other address is the redirect below — typing
   * /current-session/exercise after this bounces straight back.
   */
  function leaveSession() {
    setSession(null)
    setConfirming(null)
    setExitError(null)
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

  /* The two redirects (E9). Rendered rather than run from an effect, so React
     Router settles the address in one pass and no wrong screen is painted on
     the way; both `replace`, so a bounce piles up no history entries. Both wait
     for `loaded`, because before the answer is known neither question has one.

     They cannot loop into each other: the first needs an open exercise, which
     needs a session, and the second needs no session at all.

     There is deliberately no third. /current-session/exercise with a session
     and nothing open is a legitimate landing — it is the chooser, and a reload
     while choosing should come back to it rather than throw the user out. */

  // While an exercise is open, that is where you are. This is the one that
  // makes the pinning real: it catches the back gesture, the nav link, a
  // bookmark and a reload alike. Two consequences, both intended — because the
  // bounce replaces, a second Back from an open exercise leaves the Current
  // session tab entirely, to wherever the user was before it (the exercise pins
  // them to the tab, not to the browser); and tapping Current session in the nav
  // lands them back inside the exercise, so End session cannot be reached until
  // they close it. That is E4, the rule the API already keeps, shown rather
  // than explained.
  if (loaded && !atExercise && openExercise !== null) {
    return <Navigate to="/current-session/exercise" replace />
  }

  // And with no session there is nothing to record into, so the address means
  // nothing: the session was ended, discarded, or there never was one.
  if (loaded && atExercise && session === null) {
    return <Navigate to="/current-session" replace />
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
        (atExercise ? (
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
              {/* What the screen is about: the movement once one is open, and
                  the question until then (Z2). The name comes off the block
                  itself, which the API answered with, so the zone can say what
                  it is recording even if the catalogue never loaded. React
                  escapes it for us — catalogue names are user data. */}
              <h2>{openExercise ? openExercise.exercise_name : 'Record new exercise'}</h2>
              {/* No × any more. Leaving an exercise is a request with a meaning
                  and the control that makes it says which meaning, down at the
                  bottom of the zone beside Log set; a second, wordless way out
                  up here would be the vaguest of the three this replaced. */}
            </div>

            {openExercise ? (
              <div className="held-exercise">
                {/* Only after a typed name turned out to exist already, and only
                    while that movement is open. Neutral: nothing went
                    wrong, and the movement it is about is the zone's heading,
                    directly above it. */}
                {alreadyThere && (
                  <p className="status">{alreadyThere} was already in the catalogue.</p>
                )}

                {/* Somebody else got to the question first, and their answer is
                    the one in use — said once, quietly, and only for as long as
                    this block is open. Not an error: the movement is answered
                    now, which is what the question was for. */}
                {loadingRaced && (
                  <p className="status">
                    Somebody had already said how this one loads — that is the answer being used.
                  </p>
                )}

                {asking ? (
                  /* In place of the boxes, not beside them: a movement nobody
                     has ever described has no settled meaning for the number
                     that would go in them (07). Everything below — last time,
                     the comparison, the Earlier lines — stays exactly where it
                     is, because that is what somebody is actually reading while
                     they work out what the bar weighs.

                     Its way out is `closeExerciseRow`, the same request the log
                     form's is, so `closing` and `closeError` go with it. */
                  <AskLoading
                    value={loadingAnswer}
                    onChange={setLoadingAnswer}
                    onSave={saveLoading}
                    onSkip={skipLoading}
                    onClose={closeExerciseRow}
                    busy={savingLoading}
                    closing={closing}
                    failure={loadingError}
                    closeError={closeError}
                  />
                ) : (
                  /* A <div>, not a <form>, and deliberately (E11): inside a form
                     Enter in either box logged a set, which is the most reliable
                     way there was to log something without meaning to. There is
                     now no keystroke anywhere in the zone that writes a set —
                     only the tap on Log set. The inline edit form in a set row is
                     a different act and keeps its Enter, and so does the question
                     one state back, which has no set to log. */
                  <div className="log-set">
                    {/* One box, whatever the movement: the total for a stack or
                        an unanswered movement, one side for a barbell. The
                        loading is the open block's own — `exercise_bar_kg` and
                        `exercise_sides`, which came with the row — and never a
                        catalogue lookup.

                        `typeWeight`, not `setWeight`: the box's behaviour stays
                        on this page, so the draft (E10) is written on the
                        keystroke and `restored` is cleared by the same hand that
                        set it. Handing `WeightEntry` a plain setter is how that
                        whole feature disappears without an error to show for
                        it. */}
                    <WeightEntry
                      loading={loadingOf(openExercise)}
                      value={weight}
                      restored={restored}
                      onChange={typeWeight}
                    />
                    <p>
                      <label htmlFor="set-reps">Reps</label>
                      <input
                        id="set-reps"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="1"
                        value={reps}
                        data-restored={restored ? '' : undefined}
                        onChange={(event) => typeReps(event.target.value)}
                      />
                    </p>
                    {/* The other half of the marker, and the half that says what
                        happened. Quiet — `.status` weight, not an error, because
                        nothing went wrong — and it sits between the boxes and Log
                        set, in the path of the eye going from one to the other.
                        It is not a gate: Log set is as live as it ever was, and
                        there is no dialog between the user and the bar.

                        Nothing may be inserted between this line and the buttons
                        below: `.log-set .restored-note + .log-set-actions` is an
                        adjacent-sibling rule, and anything in the gap silently
                        doubles the band kept for it. */}
                    {restored && (
                      <p className="status restored-note">
                        Picked up where you left off — check these before logging.
                      </p>
                    )}
                    {/* One tap per set, and one way out of the exercise — which
                        is the whole of the change here. Log set is off until the
                        entry is a set, and off again while anything is in flight,
                        so a second tap cannot log a second set (A9).

                        Beside it stands exactly one control, and it says which
                        act it is because the two acts are now different requests
                        with different outcomes. Nothing logged yet: Change
                        exercise, and the block is deleted as though the movement
                        had never been picked (E5). Something logged: Log exercise,
                        and it is stamped closed and goes into the workout. The ×,
                        the old Log exercise and the old Change exercise all did
                        the identical client-side nothing; there is one of them
                        now, and it does something.

                        There is deliberately no way to abandon an exercise that
                        has sets in it — what is in the log is in the log. The way
                        back from a mis-tap is already here and needs no button of
                        its own: delete the sets one by one in the list below, and
                        when the last one goes this control flips back to Change
                        exercise, which removes the block. Do not add a Discard. */}
                    <div className="log-set-actions">
                      <button
                        className="button button--tap"
                        type="button"
                        onClick={logSet}
                        disabled={entry === null || logging || closing}
                      >
                        {logging ? 'Logging…' : 'Log set'}
                      </button>
                      {openSets.length > 0 ? (
                        <button
                          className="log-exercise"
                          type="button"
                          onClick={closeExerciseRow}
                          disabled={logging || closing}
                        >
                          {closing ? 'Logging…' : 'Log exercise'}
                        </button>
                      ) : (
                        <button
                          className="change-exercise"
                          type="button"
                          onClick={closeExerciseRow}
                          disabled={logging || closing}
                        >
                          {closing ? 'Changing…' : 'Change exercise'}
                        </button>
                      )}
                    </div>
                    {/* Beside the buttons, where the tap that failed was: nothing
                        typed is touched, so the same values are there to retry. */}
                    {logError && (
                      <p className="status" data-state="error">
                        {logError}
                      </p>
                    )}
                    {closeError && (
                      <p className="status" data-state="error">
                        {closeError}
                      </p>
                    )}
                  </div>
                )}

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
                    sets={openSets}
                    scope="held"
                    rows={rows}
                    lastTime={lastTime === null ? undefined : lastTime.performed_sets}
                    // Off the open block, which carries the movement's loading
                    // itself, so the zone needs nothing fetched and nothing
                    // looked up. Last time's column is the same movement by
                    // construction, so one loading serves both.
                    loading={loadingOf(openExercise)}
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
                            {/* One string, deliberately, where the rows above
                                are two tiers. This block is already the third
                                and quietest tier — `.earlier-sessions` is dimmer
                                again than last time's column — and opacity
                                compounds: stepping the working back inside it
                                would put it below the weight the dashes are
                                drawn at, while a bold total would make the line
                                meant for the corner of the eye the loudest text
                                in the zone. Six sets comma-joined is also a
                                sentence rather than a column, with no place the
                                eye returns to. So it stays a sentence. */}
                            <span>
                              {performed.performed_sets
                                .map((set) => setSummary(set, loadingOf(performed)))
                                .join(', ')}
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
                onAdded={chooseCreated}
                onDuplicate={chooseExisting}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <>
                <select
                  aria-label="Exercise"
                  value=""
                  // Off while the exercise it just picked is being opened: the
                  // wait is short, but a second pick during it would be a second
                  // block nobody asked for (A9).
                  disabled={catalogueState !== 'ready' || opening}
                  onChange={(event) => {
                    const chosen = event.target.value
                    // The sentinel opens the form and goes no further: only
                    // catalogue ids are ever sent as an exercise.
                    if (chosen === ADD_NEW) setAdding(true)
                    else openExerciseRow(chosen)
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
                {/* The round trip, said out loud rather than hidden behind an
                    optimistic row (A9): picking a movement writes it down, and
                    the half-second it takes is the difference between having
                    tapped a list and being in an exercise. */}
                {opening && <p className="status">Opening…</p>}
                {openError && (
                  <p className="status" data-state="error">
                    {openError}
                  </p>
                )}
                {/* <Status> above speaks for the session, so a catalogue that
                    will not load says so here rather than looking like one. */}
                {catalogueState === 'error' && (
                  <p className="status" data-state="error">
                    Could not load the exercise list. Please try again.
                  </p>
                )}
                {/* The one way out of the zone that writes nothing, because
                    nothing has been opened yet. It wears the same treatment as
                    Change exercise one state along: both are "not this, take me
                    back", and neither destroys anything. */}
                <div className="zone-actions">
                  <button
                    className="change-exercise"
                    type="button"
                    onClick={cancelChoosing}
                    disabled={opening}
                  >
                    Cancel
                  </button>
                </div>
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
              onClick={() => navigate('/current-session/exercise')}
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
                    />
                  ))}
                </ol>
              )}
            </section>

            {/* Outside Completed exercises and at the very bottom of the page, a
                long scroll clear of Log set: this is the one tap that closes the
                workout, and it should take deliberate reaching for. Ending a
                session with nothing logged in it deletes it rather than filing
                it — end/ answers 204 — and this file still needs no special case
                for that: the response is never read and leaveSession() runs
                either way. The question is deliberately the same either way
                too; a workout you did not start is not worth different
                wording. */}
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
