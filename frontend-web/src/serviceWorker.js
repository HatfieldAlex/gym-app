// Registering the pass-through worker in public/sw.js.
//
// The path is /sw.js in both homes, and deliberately so. A worker controls only
// URLs at or below its own path, and the built copy lives at /static/sw.js,
// whose scope could never reach the app at /. Vite serves public/ at the root
// in development; Django serves the same built file at /sw.js from a route
// above the SPA catch-all (backend/settings/urls.py). Vite rewrites
// root-absolute URLs in index.html, but not string literals in JavaScript, so
// this one path is right in both places with nothing to branch on.
export function registerServiceWorker() {
  // Development is left alone: the dev server's HMR client has no business
  // behind a service worker, and one registered against localhost outlives the
  // code that registered it -- it has to be unregistered by hand afterwards.
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  // After load, so registering never competes with the first paint or with the
  // app's first request for data.
  window.addEventListener('load', () => {
    // A script at /sw.js already implies this scope. Saying it anyway makes a
    // moved file fail loudly rather than quietly registering a narrower one.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Losing the worker costs the install prompt and nothing else, so it must
      // never reach the user or surface as an unhandled rejection. Chrome logs
      // the real reason to the console by itself.
    })
  })
}
