import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/exercises-catelog', label: 'Exercise catalogue' },
  { to: '/training-sessions', label: 'Training sessions' },
  { to: '/settings', label: 'Settings' },
]

/** Shown only to signed-in visitors, as the server-rendered shell did. */
export default function Nav() {
  return (
    <nav>
      {LINKS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
