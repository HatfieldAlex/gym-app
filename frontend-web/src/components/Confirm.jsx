/** The second tap, in the place the first one was.
 *
 * Both ways out of a session confirm through here rather than through
 * `window.confirm`: a blocking native dialog mid-workout is easy to dismiss by
 * accident, lands wherever the browser puts it, and cannot be sized to a thumb.
 * Cancel puts the button back and nothing has been sent.
 *
 * Shared now rather than sitting beside its only caller: `CurrentSession` asks
 * through it before discarding or ending a session, and Settings' edit gate
 * asks through it before turning editing on.
 */
export default function Confirm({ question, verb, busy, onConfirm, onCancel }) {
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
