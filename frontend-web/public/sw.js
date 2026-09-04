// A pass-through service worker: it caches nothing, stores nothing, and changes
// no response. It exists because Chrome will not offer to install a web app
// without a registered worker that handles fetch.
//
// Keep it this way. A worker that answers from a cache can serve a stale app to
// a phone with no obvious way to clear it, and this app is online-only by
// design — there is nothing useful to do with a workout log that cannot reach
// the API.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
