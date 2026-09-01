import { useEffect, useRef, useState } from 'react'

/**
 * Fetch-on-mount with the three states every page here has: waiting, loaded,
 * failed. Pages render from `data` and hand `state` and `error` to <Status>, so
 * none of them has to reinvent either half.
 *
 * `load` is re-run whenever `deps` change, and a result that arrives after the
 * inputs moved on is dropped rather than rendered.
 */
export function useLoad(load, deps = []) {
  const [result, setResult] = useState({ state: 'loading', data: null, error: null })

  // The callback is read through a ref so a page can pass an inline arrow
  // without re-fetching on every render.
  const latestLoad = useRef(load)
  useEffect(() => {
    latestLoad.current = load
  })

  useEffect(() => {
    let cancelled = false
    setResult({ state: 'loading', data: null, error: null })

    latestLoad.current().then(
      (data) => {
        if (!cancelled) setResult({ state: 'ready', data, error: null })
      },
      (error) => {
        if (cancelled) return
        console.error(error)
        setResult({ state: 'error', data: null, error })
      },
    )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return result
}

/** Set the tab title for as long as a page is mounted. */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
