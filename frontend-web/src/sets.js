/**
 * How a set reads, in one place.
 *
 * An exercise says how it is loaded — a bar weight and a side count — and from
 * that a stored total can be read back as the arithmetic that made it:
 * `20 + 2 × 60 = 140 kg`. The middle number is the one that actually went on
 * one side, and the one a person thinks in week to week.
 *
 * Only the total is stored. Per side is derived here, at display time, and
 * never written down: storing it would put an assumption beside a measurement,
 * and the two would eventually disagree. Every screen that shows a set imports
 * these functions rather than keeping its own copy — the rounding rule in
 * particular needs exactly one home, because the day there are two of them is
 * the day one of them is corrected and the other is not.
 *
 * The last two functions run the arithmetic the other way, for the box a set is
 * typed into: `entryPrefix` says what stands beside that box and `totalFrom`
 * turns one side back into the total that is sent. They live here, beside
 * `perSide` and `weightText` rather than in a form, for the same reason — the
 * number typed in and the number read back have to be the same number, and two
 * copies of the rule is how that stops being true.
 *
 * Nothing here sends or stores anything: it hands back text, and the caller
 * decides what to do with it. Most of that text is a whole line; two of the
 * functions — `weightParts` and `setParts` — hand back the same line already cut
 * in two, at the one place it is worth cutting: the working on one side, the
 * answer on the other. That cut is here rather than in a component because
 * *where* it falls is a display rule like all the others, and a caller that made
 * the cut itself would be a second copy of the collapse rules.
 */

/** A loading is `{ bar_kg, sides }` and unset is `null` in both of them.
 *
 * `bar_kg` arrives from DRF as a decimal string — "20.00" — the same as
 * `weight_kg` does; `sides` arrives as a number, 1 or 2.
 *
 * Both columns are set or neither is (W1), which the database enforces, but
 * every reader here tests both anyway: a reader that tests one is a reader that
 * renders `undefined` the day the other goes missing. `null`, `undefined` and
 * an object with nulls in it all mean the same thing — nobody has said how this
 * movement is loaded — and all three come out as today's plain total.
 */
function isConfigured(loading) {
  if (!loading) return false
  return (
    loading.bar_kg !== null &&
    loading.bar_kg !== undefined &&
    loading.sides !== null &&
    loading.sides !== undefined
  )
}

/** Kilos as an integer count of thousandths.
 *
 * All the arithmetic below runs on integers and formats out at the end, because
 * a float sum is `0.1 + 0.2` and that must never reach a screen. Thousandths
 * rather than hundredths because halving a two-decimal total is exactly where a
 * third decimal appears, and it has to stay an integer for the whole trip.
 */
function thousandths(value) {
  return Math.round(Number(value) * 1000)
}

/** Thousandths back to the shortest exact string: 45000 → "45", 43775 → "43.775".
 *
 * Exact, never rounded (W3) — the expression has to add up to the weight that
 * was actually lifted, so a tidy `43.78` would describe a set nobody did — but
 * trailing zeros are noise rather than precision, so `45.000` reads `45`.
 */
function formatKg(count) {
  const sign = count < 0 ? '-' : ''
  const size = Math.abs(count)
  const fraction = String(size % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  const whole = Math.floor(size / 1000)
  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`
}

/** Thousandths as a two-decimal string: 140000 → "140.00".
 *
 * How a *computed* total travels to the API. Two decimals because that is the
 * column — `DecimalField(max_digits=6, decimal_places=2)` — and a string all the
 * way because a JavaScript number is exactly how a rounding error gets written
 * down. Built by splitting the integer count rather than dividing by 1000, so
 * no float touches the number between the keypad and the database.
 *
 * Its argument is a whole number of pennies-of-a-kilo, i.e. a multiple of ten
 * thousandths; `totalFrom` refuses anything else before it gets here.
 */
function formatPennies(count) {
  const pennies = count / 10
  return `${Math.floor(pennies / 100)}.${String(pennies % 100).padStart(2, '0')}`
}

/** The loading of a performed exercise, as the API carries it.
 *
 * `PerformedExerciseSerializer` hangs `exercise_bar_kg` and `exercise_sides`
 * beside `exercise_name`, so a session read back carries how each movement is
 * loaded without a second request per exercise. This turns that pair into the
 * `{ bar_kg, sides }` the rest of this module takes — the same shape a
 * catalogue entry already has, so a page holding one can pass it straight in.
 */
export function loadingOf(performed) {
  return {
    bar_kg: performed?.exercise_bar_kg ?? null,
    sides: performed?.exercise_sides ?? null,
  }
}

/** What went on one side: `(weight_kg − bar_kg) / sides`, exactly, as a string.
 *
 * `null` when there is no such number to give, which is three different things
 * and one answer:
 *
 * - **No weight at all.** `weight_kg` null is a bodyweight set — a set that
 *   carried none, not a set missing a value (W9) — and there is nothing to
 *   split. It is never read as a set of the empty bar.
 * - **Nobody has said how this loads.** Unset is not zero (AGREED 5): an
 *   exercise with no bar and no side count reads exactly as it read yesterday,
 *   because unknown is not the same claim as `0`.
 * - **A total lighter than its own bar.** The seeded data has these — an early
 *   barbell curl at 17.5 kg against a 20 kg bar — and they are sets logged
 *   before anyone said what the bar was. `20 + 2 × −1.25` describes nothing;
 *   the plain total is still true, so that is what is shown (W4).
 */
export function perSide(weightKg, loading) {
  if (weightKg === null || weightKg === undefined) return null
  if (!isConfigured(loading)) return null

  const sides = Number(loading.sides)
  const load = thousandths(weightKg) - thousandths(loading.bar_kg)
  if (load < 0) return null

  // A two-decimal total less a two-decimal bar is a multiple of ten thousandths,
  // and `sides` is 1 or 2, so this divides exactly. The guard is for the day it
  // does not: rather than round — the one thing this module must never do — the
  // caller is told there is no per-side number and falls back to the total.
  if (load % sides !== 0) return null
  return formatKg(load / sides)
}

/** The weight half of a line in two tiers: the working, and the answer.
 *
 * `null` for a set that carried no weight — there is no weight to describe, and
 * a bodyweight set says so in words rather than in kilos (W9). Otherwise
 * `{ working, total }`, and `working` is `null` when there is no expression to
 * show. The whole table of cases, in order:
 *
 * | The set                          | `working`     | `total`    |
 * |----------------------------------|---------------|------------|
 * | `weight_kg` null                 | `null` — no parts at all   |
 * | unset, or below its own bar      | `null`        | `140 kg`   |
 * | `bar_kg` 0, `sides` 1            | `null`        | `50 kg`    |
 * | `sides` 1, `bar_kg` > 0          | `25 + 50`     | `= 75 kg`  |
 * | `sides` 2                        | `20 + 2 × 60` | `= 140 kg` |
 *
 * Two strings rather than one because the total is the *answer* and the rest is
 * how it was got to. Drawn alike they are one run of numbers and the reader has
 * to find the answer again on every row; drawn a step apart, a glance lands on
 * `= 140 kg` and a proper look tells you what was on the bar. `weightText`
 * rejoins them with the single space they were cut at, so the two forms can
 * never describe a set differently.
 *
 * **The `=` belongs to the total.** The box a set is typed into reads
 * `20 + 2 ×` · box · `= 140 kg`, with the equals in the answer's half; a set
 * read back afterwards has to be cut in the same place, or the same movement
 * would be drawn two ways on one screen.
 *
 * The two collapses are the same judgement made twice. A stack or a sled is
 * `0 × 1`, and `0 + 1 × 50 = 50` says nothing that `50` did not (AGREED 7); a
 * single side with a real bar keeps the `+ 25`, because that is load, but drops
 * the `1 ×`, because multiplying by one is not arithmetic (W8).
 *
 * `unit` drops the trailing `kg` and nothing else — `20 + 2 × 60`, `= 140`. It
 * is for the one caller that already sits under a column headed **Weight (kg)**,
 * where the unit would be said twice. Every other caller wants it, so it is on
 * by default and no existing call site changes.
 */
export function weightParts(weightKg, loading, { unit = true } = {}) {
  if (weightKg === null || weightKg === undefined) return null

  // The stored total, formatted from its own thousandths so the expression ends
  // on the exact number the API sent rather than on a sum of its parts.
  const total = `${formatKg(thousandths(weightKg))}${unit ? ' kg' : ''}`

  const side = perSide(weightKg, loading)
  if (side === null) return { working: null, total }

  const bar = thousandths(loading.bar_kg)
  const sides = Number(loading.sides)
  if (bar === 0 && sides === 1) return { working: null, total }
  if (sides === 1) return { working: `${formatKg(bar)} + ${side}`, total: `= ${total}` }
  return { working: `${formatKg(bar)} + ${sides} × ${side}`, total: `= ${total}` }
}

/** The same weight as one string: `"20 + 2 × 60 = 140 kg"`, or `null`.
 *
 * `weightParts` put back together at the space it was cut at. For every caller
 * that wants a line rather than two tiers — a run of sets read in one breath,
 * and the live total beside the box, which is already spelled out to its left.
 */
export function weightText(weightKg, loading, options) {
  const parts = weightParts(weightKg, loading, options)
  if (parts === null) return null
  return parts.working === null ? parts.total : `${parts.working} ${parts.total}`
}

/** One whole set in the same two tiers: `20 + 2 × 60` and `= 140 kg × 8`.
 *
 * Never `null` — every set reads as *something*, even if that something is the
 * empty string — so a caller has one thing to check and it is `working`.
 *
 * The reps go with the total, not with the working. `× 8` is part of what the
 * set was, not part of how its weight was arrived at, and it is half of what the
 * row was already read for before any of this existed: what a row said a
 * fortnight ago, `140 kg × 8`, is exactly what is left standing at full weight
 * once the working is stepped back in front of it.
 *
 * `loading` is the movement this set belongs to, in either of the two shapes it
 * comes in: a catalogue entry, which carries `bar_kg` and `sides` itself, or
 * `loadingOf(performed)` for a set read back out of a session.
 */
export function setParts(set, loading) {
  const weight = weightParts(set.weight_kg, loading)
  // Neither weight nor reps: nothing to say, and the row says it in no
  // characters rather than in a dash it would have to explain.
  if (set.reps === null) return weight ?? { working: null, total: '' }
  // A set that recorded no weight is a bodyweight set, not a set missing a
  // value: it says so in words rather than showing `null`, `0 kg` or a dash, and
  // it says so whatever the exercise turns out to be loaded with — a movement
  // configured `0 / 2` still reads `8 reps` and never `0 + 2 × 0` (W9).
  if (weight === null) return { working: null, total: `${set.reps} reps` }
  return { working: weight.working, total: `${weight.total} × ${set.reps}` }
}

/** One set as a single line: "20 + 2 × 60 = 140 kg × 8", or "8 reps".
 *
 * `setParts` rejoined, for the places a set is one item in a run of them rather
 * than a row of its own — where two tiers would be two dozen fragments and the
 * line is read at a glance anyway.
 *
 * `weight_kg` arrives as a decimal string — "60.00" — so it goes through the
 * arithmetic above to read as it was typed.
 */
export function setSummary(set, loading) {
  const { working, total } = setParts(set, loading)
  return working === null ? total : `${working} ${total}`
}

/** The fixed context standing to the left of the one box: "20 + 2 ×", or "25 +".
 *
 * `null` when there is none, and then the form shows exactly the box it always
 * showed, labelled exactly as it always was: an unset movement, because unknown
 * is not zero (AGREED 5), and a `0 / 1` stack or sled, because `0 + 1 ×` adds
 * nothing to a number you can simply type (AGREED 6). `sides` 1 with a real bar
 * keeps its `+ 25` and drops the `1 ×` — that is load, and multiplying by one is
 * not arithmetic (W8).
 *
 * The same two collapses `weightText` makes when it reads a set back, deliberately
 * next door to it: the box a number is typed into and the line it is read back on
 * must never disagree about which movements have an expression.
 *
 * It is text and only ever text. The bar and the side count are facts about the
 * movement, fixed when it was added, and there is no edit path to them from here
 * or anywhere (AGREED 2) — so nothing this returns may be rendered as a control,
 * or as anything that looks like one.
 */
export function entryPrefix(loading) {
  if (!isConfigured(loading)) return null

  const bar = thousandths(loading.bar_kg)
  const sides = Number(loading.sides)
  if (bar === 0 && sides === 1) return null
  if (sides === 1) return `${formatKg(bar)} +`
  return `${formatKg(bar)} + ${sides} ×`
}

/** One typed side back into the total that is stored: the exact inverse of `perSide`.
 *
 * `null` means "not a set yet" and the caller sends nothing — the same answer a
 * trailing `.` has always got. Three ways to get it: a blank box (which is a
 * bodyweight set, and belongs to the caller — W9), a half-typed number, and a
 * total that does not land on an exact multiple of 0.01.
 *
 * That last rule is on the **total** and never on what was typed. `43.775` a side
 * on a `20 / 2` movement makes exactly `107.55`, which is a real set and has to
 * stay one — not least because that is the number chunk 05 will put back in the
 * box when it is edited. It also applies only where a total is actually computed:
 * the plain box hands its string over untouched, exactly as it did before this
 * iteration, and an over-precise number there is still the server's 400 to give
 * rather than this function's to pre-empt.
 */
export function totalFrom(typed, loading) {
  const value = String(typed ?? '').trim()
  // The shape check the total box has always had (`parseEntry`), now applied to
  // the number that is actually typed. A half-typed weight is a mistake, not a
  // set; a blank one is bodyweight and never reaches here.
  if (!/^\d+(\.\d+)?$/.test(value)) return null

  // No expression beside the box means nothing to add and nothing to multiply,
  // so what was typed *is* the total, and it travels as the string it was typed
  // as — `62.5` reaching a decimal column without a float rounding it first.
  // Asking `entryPrefix` rather than re-testing the loading is what stops the
  // two from ever collapsing on different movements.
  if (entryPrefix(loading) === null) return value

  const total = thousandths(loading.bar_kg) + Number(loading.sides) * thousandths(value)
  // All a two-decimal column can hold. A total between pennies is "not a set
  // yet" for the same reason a trailing dot is: there is no way to write it down.
  if (total % 10 !== 0) return null
  return formatPennies(total)
}
