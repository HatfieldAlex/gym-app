# 02 — Backend: the endpoint

**Goal:** `POST /api/v1/feedback-notes/` writes a note for the signed-in user,
and `GET` on the same route lists that user's own notes. Two verbs, nothing else.

Needs chunk 01. Backend only; no frontend files change.

## Read first

- `backend/feedback/models.py` as chunk 01 left it
- [backend/catalog/serializers.py](../../backend/catalog/serializers.py) and
  [backend/catalog/views.py](../../backend/catalog/views.py) — the shape to copy
- [backend/observations/views.py](../../backend/observations/views.py) —
  `get_queryset` scoping and `perform_create` stamping `user`
- [backend/settings/api_urls.py](../../backend/settings/api_urls.py)

## Build

1. **Serializer** — `feedback/serializers.py`, `FeedbackNoteSerializer`, a
   `ModelSerializer` over `FeedbackNote`.

   - `fields = ['id', 'body', 'kind', 'page_path', 'created_at']`.
   - `read_only_fields = ['id', 'created_at']`.
   - **`user` is not a field at all** (B1). Not read-only, not hidden — absent.
     The view supplies it; a client cannot name an owner even to get it ignored.
   - **`resolved_at` is not a field** either (B2). Triage is admin-only, and the
     writer never sees a status.
   - `body`: `max_length=2000` (B9), and a `validate_body` that strips
     surrounding whitespace, returns the stripped text, and raises a
     `ValidationError` for what is left empty — "A note needs something in it."
     Whitespace-only must be rejected, not stored.
   - `kind` and `page_path` are both optional on write and take the model's
     defaults when omitted (B10).

2. **Viewset** — `feedback/views.py`, `FeedbackNoteViewSet`, built from
   `mixins.CreateModelMixin`, `mixins.ListModelMixin` and
   `viewsets.GenericViewSet` rather than `ModelViewSet`. Create and list are the
   only two things a client may do; a note cannot be edited, and deleting one is
   the admin's job (B2). Give it a docstring saying so.

   - `get_queryset` returns
     `FeedbackNote.objects.filter(user=self.request.user)` — the model's
     `Meta.ordering` already puts newest first, so do not re-order here.
   - `perform_create` does `serializer.save(user=self.request.user)`.
   - Authentication comes from the project-wide
     `DEFAULT_PERMISSION_CLASSES`; add nothing (B7).

3. **Route.** Register in
   [api_urls.py](../../backend/settings/api_urls.py):
   `router.register('feedback-notes', FeedbackNoteViewSet, basename='feedbacknote')`,
   after the observations registrations. The explicit `basename` is required for
   the same reason the comment there already gives: the queryset is built
   per-request from the signed-in user.

4. **Tests** — `feedback/tests.py`, an `APITestCase` with two users. Cover:
   a POST of `{"body": "…"}` alone returns 201 and lands owned by the requester
   with `kind == 'idea'`; a POST that *tries* to set `"user"` is ignored rather
   than obeyed; an empty and a whitespace-only body both return 400; a 2001-
   character body returns 400; the list returns only the requester's own notes,
   newest first; an anonymous POST returns 403. This is the only chunk in the
   series with tests, because it is the only one whose contract is invisible
   from the screen.

## Done when

- `make test` passes, including the new cases.
- Signed in, `POST /api/v1/feedback-notes/` with `{"body": "the rest timer
  should keep running"}` returns 201 with an `id`, `created_at`,
  `kind: "idea"`, `page_path: ""`, and no `user` or `resolved_at` in the
  response.
- The same POST with `{"body": "  ", "kind": "bug"}` returns 400 with a `body`
  field error.
- A POST with `{"body": "x", "kind": "nonsense"}` returns 400 naming `kind`.
- A POST including `"user": <other user's id>` returns 201 and the note belongs
  to the requester.
- `GET /api/v1/feedback-notes/` returns that user's notes, newest first, and
  none of the other user's.
- `PATCH`, `PUT` and `DELETE` on `/api/v1/feedback-notes/<id>/` return 405.
- The note shows up in the admin from chunk 01 with its body and its blank path.

## Do not

- Use `ModelViewSet`. Update and destroy routes must not exist.
- Expose `user` or `resolved_at` through the serializer, in either direction.
- Add filtering, search or query parameters to the list.
- Add pagination settings, throttling or a rate limit of your own — whatever the
  project already configures applies unchanged.
- Add an email, webhook, notification or any other side effect on create.
- Change anything under `frontend-web/`, or touch chunk 01's model — if a column
  is missing, fix it in 01 and re-run its migration rather than adding a second
  one here.

## What the user sees

**No user-facing changes.** No screen gains anything: the app still has no way to
write a note, and nothing renders one. This chunk is the door the panel in
chunks 03.0–03.5 will knock on, and a `curl` (or the DRF browsable API at
`/api/v1/feedback-notes/`) is the only way to see it work.
