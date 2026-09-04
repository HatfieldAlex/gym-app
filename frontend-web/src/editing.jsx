import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from './auth.jsx'

/**
 * Whether the app is currently willing to ask to change a finished record.
 *
 * A deliberateness gate, not a permission. The server refuses a write to a
 * logged block whatever this says, and nothing on this side is trusted by
 * anything but the UI: all it decides is whether the app offers the door at
 * all. Turning it on is two taps on Settings, and it is meant to be a state you
 * cannot end up in without having read the warning above it.
 *
 * In memory only -- no storage, no cookie, no URL, nothing on the server. It
 * ends when the tab reloads, when the user logs out, and after fifteen minutes
 * without a tap or a keystroke.
 */
const EditGateContext = createContext(null)

// Fifteen minutes, with the minutes visible. Idle, not armed: any pointer or
// key anywhere in the document starts the fifteen over, so it never disarms
// mid-edit and never outlives someone walking away from the phone.
const IDLE_MS = 15 * 60 * 1000

export function EditGateProvider({ children }) {
  const [armed, setArmed] = useState(false)
  const { isAuthenticated } = useAuth()

  const arm = useCallback(() => setArmed(true), [])
  const disarm = useCallback(() => setArmed(false), [])

  // Logging out ends it, whichever screen did the logging out.
  useEffect(() => {
    if (!isAuthenticated) setArmed(false)
  }, [isAuthenticated])

  // The timer is a ref and the handler reschedules it in place, so a keystroke
  // costs a clearTimeout and a setTimeout rather than a render: an armed app
  // re-renders exactly as often as a disarmed one. Listeners exist only while
  // armed -- the cleanup below is the whole of the disarmed case.
  const idleTimer = useRef(null)
  useEffect(() => {
    if (!armed) return undefined

    function restart() {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setArmed(false), IDLE_MS)
    }
    restart()

    // On `document`, so a tap anywhere counts, and passive because neither
    // handler does anything a browser needs to wait for.
    document.addEventListener('pointerdown', restart, { passive: true })
    document.addEventListener('keydown', restart, { passive: true })
    return () => {
      clearTimeout(idleTimer.current)
      document.removeEventListener('pointerdown', restart)
      document.removeEventListener('keydown', restart)
    }
  }, [armed])

  const value = useMemo(() => ({ armed, arm, disarm }), [armed, arm, disarm])

  return <EditGateContext value={value}>{children}</EditGateContext>
}

export function useEditGate() {
  const context = useContext(EditGateContext)
  if (context === null) {
    throw new Error('useEditGate must be used inside an <EditGateProvider>')
  }
  return context
}
