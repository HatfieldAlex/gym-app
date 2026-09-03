/**
 * A weight, or a whole set, with its working drawn a step behind its answer.
 *
 * The two halves come from `sets.js` — `weightParts` or `setParts` — already
 * cut: `working` is `20 + 2 × 60` and `total` is `= 140 kg × 8`. Nothing is
 * decided here. Which movements have working, where the string is cut, and what
 * either half says are all display rules and all live in that module; this
 * component only knows that the second half is the one the eye is looking for.
 *
 * **No working, no markup.** A bodyweight set, a movement nobody has said how to
 * load, a stack, a total lighter than its own bar: `working` is `null` and the
 * total is handed back as bare text, exactly the text those rows carried before
 * any of this existed and in exactly as many elements — none. A set this feature
 * has nothing to say about is a set it does not touch.
 *
 * `.per-side-fixed` and `.per-side-total` are the classes the log form's live
 * sum already wears, and they are worn here on purpose rather than copied: the
 * number being typed and the number read back a second later are the same
 * number, and drawing them two ways would say they were not.
 *
 * The wrapper is not decoration. In the zone's paired list `.set-measures` and
 * `.set-last` are flex boxes — they centre their line in a row another cell may
 * have made two lines tall — and two spans handed straight to one of those would
 * be two flex items: the space between them dropped, and no wrapping inside a
 * 6rem column. Wrapped once, the cell gets the single item it was already
 * getting and the text wraps inside it as it always did.
 */
export default function Worked({ working, total }) {
  if (working === null || working === undefined) return total

  return (
    <span className="worked">
      <span className="per-side-fixed">{working}</span>{' '}
      <span className="per-side-total">{total}</span>
    </span>
  )
}
