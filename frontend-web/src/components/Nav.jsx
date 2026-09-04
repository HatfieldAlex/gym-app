import { NavLink } from 'react-router-dom'

import { useEditGate } from '../editing.jsx'
import FeedbackMarker from './FeedbackMarker.jsx'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/current-session', label: 'Current session' },
  { to: '/exercises-catelog', label: 'Exercise catalogue' },
  { to: '/training-sessions', label: 'Training sessions' },
  { to: '/settings', label: 'Settings' },
]

/** Shown only to signed-in visitors, as the server-rendered shell did. */
export default function Nav() {
  const { armed } = useEditGate()

  return (
    <nav>
      {LINKS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end}>
          {label}
        </NavLink>
      ))}
      {/* Not a control: the app is in one unusual state and this says so from
          every screen, but the way out of it is on the page that turned it on. */}
      {armed && <span className="edit-armed">Editing on</span>}
      <FeedbackMarker />
    </nav>
  )
}
