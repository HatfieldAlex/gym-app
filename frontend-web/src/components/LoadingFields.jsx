import { useId } from 'react'

/** Whether a movement's loading has actually been answered.
 *
 * The rule the buttons read, in one place, so the add form (06) and the zone's
 * question (07) can never disagree about what counts as an answer.
 *
 * A bar weight is a number, zero or more, with at most two decimals — that last
 * clause is the column, `DecimalField(max_digits=6, decimal_places=2)`, and a
 * third decimal is a number the database cannot hold. A side count is one of the
 * two the catalogue allows (W5, AGREED 1) and nothing else, so the unchosen
 * first option is not an answer.
 *
 * The regex runs on the string exactly as typed, with no trimming: a
 * `type="number"` box never hands over whitespace, and a second, subtly
 * different rule for what the payload carries is how the two would drift apart.
 */
export function loadingAnswered(value) {
  const bar = String(value?.bar_kg ?? '')
  return /^\d+(\.\d{1,2})?$/.test(bar) && (value?.sides === '1' || value?.sides === '2')
}

/** Nothing answered yet — the shape both fields start in and are cleared back to.
 *
 * Blank, not zero and not two. See the component below for why that is a
 * decision rather than an omission.
 */
export const EMPTY_LOADING = { bar_kg: '', sides: '' }

/** How a movement is loaded: a bar weight and a side count, asked once.
 *
 * Two boxes and the one sentence that says why they matter, as a component
 * rather than as lines inside a form, because the identical question is asked in
 * two places: here, when a movement is added (06), and in the exercise zone,
 * when a movement that predates all this is first held (07). Two copies would
 * drift — in wording, in what counts as answered, and in whether they warn about
 * permanence — which is the same reasoning that made `AddExerciseForm` shared.
 *
 * Dumb on purpose. It owns no request, no failure and no state: `value` is
 * `{ bar_kg, sides }` as two strings straight off the controls, `onChange` gets
 * the whole next object, and whoever holds it decides what a complete answer is
 * worth by asking `loadingAnswered`.
 *
 * **Neither field has a default, and that is deliberate.** The answer is
 * permanent — there is no edit path to it from anywhere, ever (AGREED 2), and a
 * different bar is a different catalogue entry — so a defaulted `0` or a
 * defaulted `2` is a wrong answer that nobody typed and nobody can take back.
 * The next reader will want to add "sensible defaults" here; they are not
 * sensible when the answer cannot be corrected. Make the user say it.
 *
 * `disabled` is offered because a caller mid-request may want the pair frozen.
 * `AddExerciseForm` passes none: it leaves its own name box live while a POST is
 * in flight so a slow request cannot eat a correction being typed, and these two
 * belong to the same answer.
 */
export default function LoadingFields({ value, onChange, disabled = false }) {
  // Two of these can stand on one page one day, and each label has to point at
  // its own control either way.
  const id = useId()

  return (
    <>
      <p className="add-exercise-field loading-field">
        <label htmlFor={`${id}-bar`}>Bar (kg)</label>
        <input
          id={`${id}-bar`}
          type="number"
          // Bars come in halves — a 7.5 kg EZ bar — so the decimal keypad on a
          // phone rather than the numeric one.
          inputMode="decimal"
          step="any"
          min="0"
          // 0 for a stack, a sled or a pair of dumbbells; it is an answer, and
          // it has to be typed like one.
          placeholder="—"
          disabled={disabled}
          value={value.bar_kg}
          onChange={(event) => onChange({ ...value, bar_kg: event.target.value })}
        />
      </p>
      <p className="add-exercise-field loading-field loading-field--sides">
        <label htmlFor={`${id}-sides`}>Sides</label>
        <select
          id={`${id}-sides`}
          disabled={disabled}
          value={value.sides}
          onChange={(event) => onChange({ ...value, sides: event.target.value })}
        >
          {/* Unchosen, and a real state rather than a hidden one: until it is
              answered the button above stays dead. */}
          <option value="">Choose</option>
          {/* The two the catalogue allows (W5). Worded by the kit rather than by
              the number, because "1" and "2" answer a question about geometry
              that nobody asked — what is being said is whether the weight you
              type goes on once or twice. */}
          <option value="1">One — a stack, a sled or a machine</option>
          <option value="2">Two — a bar, or a pair of dumbbells</option>
        </select>
      </p>
      {/* Said once, quietly, under both boxes: the fact that decides how much
          care the two answers above deserve. It is one line and stays one line —
          the reasoning behind it is in AGREED 2 and belongs there, not on a form
          somebody is filling in mid-workout. The second clause is the way out,
          so it reads as a thing to know rather than a thing to fear. */}
      <p className="loading-note">Fixed once added — a different bar is a different exercise.</p>
    </>
  )
}
