# 02 — The endpoint

**Goal:** `GET /api/v1/export/` answers with the zip, named, for whoever is
signed in. One route, one verb.

Needs chunk 01. Backend only; no frontend files change, and no migration.

## Read first

- [00-context.md](00-context.md) — E3 (why this is a DRF view returning a plain
  `HttpResponse`), the zip filename, and the 403 convention
- `backend/dataexport/export.py` as chunk 01 left it
- [backend/settings/api_urls.py](../../backend/settings/api_urls.py) — where
  routes go, and why the router registrations carry an explicit `basename`
- [backend/settings/urls.py](../../backend/settings/urls.py) — the catch-all
  `re_path(r'^.*$', spa)` at the end, and why a route that is not under
  `/api/v1/` comes back as the SPA shell with a 200
- [backend/accounts/views.py](../../backend/accounts/views.py) — the project's
  only hand-written `APIView`s, for the docstring and decorator style
- [backend/feedback/views.py](../../backend/feedback/views.py) and
  [backend/feedback/tests.py](../../backend/feedback/tests.py) — the scoping
  docstring and the test conventions

## Build

### 1. The view

`dataexport/views.py`, one class, `DataExportView(APIView)`. Give it a docstring
saying what it answers and, in a sentence, why it is an `APIView` that returns
an ordinary `HttpResponse`: `DEFAULT_RENDERER_CLASSES` is `[JSONRenderer]`, so a
DRF `Response` cannot carry zip bytes — but DRF's `finalize_response` passes a
non-`Response` `HttpResponseBase` through untouched, and going through DRF is
what keeps SessionAuthentication and `IsAuthenticated` identical to every other
route (E3).

```python
def get(self, request):
    filename, content = export.build_archive(request.user)
    response = HttpResponse(content, content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
```

That is the whole view. Everything it could get wrong, chunk 01 already tests.

- **No `permission_classes`, and no `renderer_classes`.** The project-wide
  `IsAuthenticated` applies, so an anonymous GET is a 403 and never an ownerless
  export. Adding a zip renderer to get past content negotiation is the tempting
  wrong move: negotiation runs in `initial()`, before the handler, and a renderer
  that wins it for the success case also wins it for the 403 and 405 bodies, at
  which point DRF hands it a `{'detail': …}` dict to turn into bytes (E3a). The
  consequence is that a caller asking for `Accept: application/zip` *alone* gets
  a 406; every caller in this feature asks for
  `application/zip, application/json`, and a browser's `*/*` resolves on its
  own.
- `request.user` is passed straight through: `build_archive` decides the scope
  from `is_superuser`, and the view has no opinion about whose rows these are.
  Ownership is never a query parameter, and this route takes **no query
  parameters at all** — no `?user=`, no `?since=`, no `?format=`.
- `Content-Length` is set by Django from the body; do not set it by hand.

### 2. The route

In [api_urls.py](../../backend/settings/api_urls.py), a plain `path()` in
`urlpatterns` beside the `auth/` include, **before** `router.urls`:

```python
path('export/', DataExportView.as_view(), name='export'),
```

`reverse('api:export')` is the name the tests and any later caller use. A
comment is worth one line here: this is not a resource collection, so it is a
`path()` rather than a router registration, and the consequence is that it does
not appear in the `DefaultRouter`'s API-root listing at `/api/v1/`.

### 3. Tests

`dataexport/tests.py`, a second class beside chunk 01's — an `APITestCase` with
`cls.user`, `cls.other` and `cls.admin` (a superuser), and
`cls.url = reverse('api:export')`.

- **`test_anonymous_request_is_rejected`** — 403, first in the class, as it is in
  every other test class in this project.
- 200 for a signed-in user, `Content-Type: application/zip`, and a
  `Content-Disposition` of exactly
  `attachment; filename="gym-app-export-lifter-<stamp>Z.zip"` — assert the
  `attachment;` and the requester's username in it, not the whole stamped
  string.
- The body **is a readable zip**: `zipfile.ZipFile(io.BytesIO(response.content))`
  opens, `.testzip()` returns `None`, and `namelist()` is the nine paths.
- **Cross-user isolation over HTTP**: `cls.other`'s session id appears nowhere in
  any entry of `cls.user`'s zip. Chunk 01 tests the module; this tests that the
  route did not widen it.
- A superuser's zip contains **both** users' sessions.
- `POST`, `PATCH`, `PUT` and `DELETE` on the route all return **405**.
- **Content negotiation, pinned** (E3a): `Accept: application/zip,
  application/json` returns the zip; `Accept: */*` returns the zip; `Accept:
  application/zip` alone returns **406**. The last of those is a decision, not a
  bug, and the test is there so nobody "fixes" it with a renderer that breaks the
  403 body.
- The route is **the API's, not the SPA's**: `resolve('/api/v1/export/').func`
  is not `settings.views.spa`. `feedback/tests.py` already does this check for
  its own route — copy it. A path registered in the wrong place answers 200 with
  HTML and passes a naive smoke test.

## Done when

- `make test` passes, with the new cases on top of chunk 01's.
- With `make run` and a signed-in browser, visiting
  <http://localhost:5173/api/v1/export/> downloads a zip named after the signed-
  in user, and it opens.
- Signed out, the same URL answers 403 JSON — not the SPA shell, and not a
  redirect to a login page.
- `curl -sI -b sessionid=… http://127.0.0.1:8000/api/v1/export/` shows
  `Content-Type: application/zip` and an `attachment` disposition.
- Nothing else about the API changed: `training-sessions/`,
  `performed-exercises/`, `performed-sets/`, `exercises/`, `feedback-notes/` and
  `auth/session/` all answer byte-identically.
- `git status` shows [docs/schema.dbml](../../backend/docs/schema.dbml)
  unchanged and no new migration.

## Do not

- Register it on the `DefaultRouter`, or turn it into a viewset. It is one GET.
- Add query parameters of any kind — a date range, a table filter, a `?user=`,
  a `?format=csv`. The export is all of it, for the requester, as a zip.
- Add `permission_classes`, `authentication_classes`, a `renderer_classes`, a
  parser, or a content-negotiation override — see E3a for what a zip renderer
  does to the error responses. The project-wide settings are the whole story.
- Use `login_required` or any Django auth decorator: it answers 302 into the SPA
  catch-all, which a `fetch` reads as a successful HTML page.
- Return a DRF `Response`, add a `format` suffix route, or set a
  `Content-Length` by hand.
- Stream it, cache it, write it to disk, or hold it anywhere between requests
  (E4).
- Add a POST, a "request an export" job, an email, a queue or a webhook.
- Change `export.py` — if a column is wrong, fix it in chunk 01 and re-run its
  tests rather than patching the row on the way out.
- Change anything under `frontend-web/`.

## What the user sees

**No screen changes.** Settings looks exactly as it did; there is still no
button anywhere that downloads anything.

What exists now is a working URL. Someone who knows it, and is signed in, can
paste `/api/v1/export/` into the address bar and get their zip — which is how
this chunk is reviewed. Chunk 04 is what puts it in front of anyone who does not
know the URL.
