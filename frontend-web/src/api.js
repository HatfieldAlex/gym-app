/**
 * The single door between frontend-web and the backend.
 *
 * The app holds no data of its own: everything inside it comes from the DRF API
 * underneath /api/v1/. Authentication rides on the session cookie the login
 * call sets, so requests only need to opt into sending it.
 */
const ROOT = '/api/v1/'

export class ApiError extends Error {
  constructor(status, data) {
    super(`API request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  /** The first message DRF returned, whatever shape it chose to return it in. */
  get detail() {
    const { data } = this
    if (typeof data === 'string') return data
    if (!data || typeof data !== 'object') return null
    const first = Array.isArray(data) ? data[0] : Object.values(data)[0]
    return Array.isArray(first) ? first[0] : typeof first === 'string' ? first : null
  }
}

function csrfToken() {
  return (
    document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('csrftoken='))
      ?.slice('csrftoken='.length) ?? ''
  )
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' }
  const init = { method, headers, credentials: 'same-origin' }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  // Django rejects unsafe methods without this; safe ones are exempt. The token
  // is read per request because logging in rotates it.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRFToken'] = csrfToken()
  }

  // Absolute URLs arrive from pagination's `next`; relative ones from callers.
  const response = await fetch(path.startsWith('http') ? path : ROOT + path, init)
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data)
  }
  return data
}

/** Every page of a paginated list, flattened. */
async function list(path) {
  const results = []
  let page = await request('GET', path)
  while (page) {
    // A view with pagination switched off answers with a bare array.
    if (Array.isArray(page)) {
      return results.concat(page)
    }
    results.push(...page.results)
    page = page.next ? await request('GET', page.next) : null
  }
  return results
}

/** A file the API hands back whole: the body is bytes, not JSON. */
async function download(path) {
  // Its own function rather than a flag on request(): request() parses every
  // body as JSON unconditionally, and this one is a zip. Both media types are
  // named because DRF negotiates before the view runs and renders JSON only, so
  // asking for the zip alone answers 406.
  const response = await fetch(ROOT + path, {
    headers: { Accept: 'application/zip, application/json' },
    credentials: 'same-origin',
  })

  if (!response.ok) {
    // The error body is still JSON, so a caller's catch sees the same ApiError
    // and the same .detail as every other call in the app.
    const data = await response.json().catch(() => null)
    throw new ApiError(response.status, data)
  }

  // The server's filename is plain ASCII by construction, so one regex is
  // enough; a download with no name beats a thrown error.
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'download.zip'
  return { blob: await response.blob(), filename }
}

export const api = {
  list,
  download,
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
}
