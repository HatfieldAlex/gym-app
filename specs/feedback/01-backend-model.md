# 01 — Backend: the note

**Goal:** somewhere for a thought to land. A new `feedback` app with one model,
registered in the admin, migrated.

Backend only. No API and no route in this chunk — chunk 02 adds those. No
frontend files change.

## Read first

- [backend/catalog/models.py](../../backend/catalog/models.py) and
  [backend/catalog/admin.py](../../backend/catalog/admin.py) — the smallest
  complete app in the project; copy its shape
- [backend/observations/models.py](../../backend/observations/models.py) — for
  the UUID primary key, the user foreign key and the `Meta` conventions
- [backend/settings/settings.py](../../backend/settings/settings.py) —
  `INSTALLED_APPS`

## Build

1. **The app.** Create `backend/feedback/` as a Django app —
   `__init__.py`, `apps.py`, `models.py`, `admin.py`, `migrations/__init__.py`,
   `tests.py` — matching how `catalog` is laid out, and add `'feedback'` to
   `INSTALLED_APPS` after `'observations'`. `AppConfig.name` is `'feedback'`.

2. **The model.** One class, `FeedbackNote`, with a docstring saying what it is
   for: a thought logged from anywhere in the app without leaving the page.

   | Field | Type | Notes |
   |-------|------|-------|
   | `id` | `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)` | As every other model here. |
   | `user` | `ForeignKey(settings.AUTH_USER_MODEL, on_delete=CASCADE, related_name='feedback_notes')` | Who wrote it (B1). |
   | `body` | `TextField()` | The thought. Required; the length cap is the serializer's job (B9), not the column's. |
   | `kind` | `CharField(max_length=8, choices=…, default='idea')` | `idea` / `bug` / `other`. Defaulted so a note can be written without deciding (B10). Follow `TrainingSession.type` for the `max_length=8`-and-default shape. |
   | `page_path` | `CharField(max_length=200, blank=True, default='')` | Where the writer was when the thought arrived — an in-app path like `/current-session`. Blank when unknown; chunk 04 is what fills it. |
   | `created_at` | `DateTimeField(auto_now_add=True)` | When it was written. There is no second timestamp: unlike a training session, a note has no "when it really happened" distinct from when it was typed. |
   | `resolved_at` | `DateTimeField(null=True, blank=True)` | Null means still outstanding. **Admin-only** (B2); no API in any chunk reads or writes it. |

   Use `models.TextChoices` for `kind` and give `page_path` and `resolved_at` a
   `help_text` saying, respectively, that it is where the writer was and that
   null means outstanding.

3. **`Meta`.** `verbose_name = 'feedback note'`, the plural, and
   `ordering = ('-created_at',)` — newest first is the only order anything ever
   wants, so it belongs on the model rather than being repeated by each caller.
   Add one index, `models.Index(fields=['user', 'created_at'], name='feednote_user_created_idx')`.

4. **`__str__`.** The first ~60 characters of `body`, so the admin's
   change-list and every `raw_id` widget reads as the note rather than as a
   UUID.

5. **Admin.** Register it in `feedback/admin.py`:

   - `list_display` — a short body preview, `kind`, `user`, `page_path`,
     `created_at`, and a boolean `is_open` column (`resolved_at is None`),
     following `TrainingSessionAdmin.is_open` including its
     `@admin.display(boolean=True, ordering='resolved_at')`.
   - `list_filter` on `kind` and `created_at`, `search_fields` on `body` and
     `user__username`, `ordering = ('-created_at',)`,
     `list_select_related = ('user',)`,
     `readonly_fields = ('id', 'created_at')`,
     `autocomplete_fields = ('user',)`.
   - Two admin actions, `mark_resolved` and `mark_unresolved`, setting or
     clearing `resolved_at` in bulk. This is the whole triage workflow (B2).

6. **Migration.** `makemigrations feedback` then `migrate`. It is a single
   `CreateModel` — a new table, nothing backfilled, nothing touched elsewhere.
   The `migrate` run also rewrites
   [docs/schema.dbml](../../backend/docs/schema.dbml) through `schemadocs`;
   commit that diff, and **do not hand-edit the file**.

## Done when

- `make migrate` applies one new migration and prints
  `schemadocs: regenerated …/schema.dbml`.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `docs/schema.dbml` has a `feedback_note` table with all seven columns and the
  `(user_id, created_at)` index, and no other table in the file changed.
- `make test` still passes.
- **Feedback notes** appears in the admin at `/admin/`; a note can be added
  there, lists newest first with its body as the label, and the two actions
  flip the open/resolved column.
- A note saved with no `kind` comes out as `idea`; one saved with no
  `page_path` comes out as `''`, not `None`.

## Do not

- Add a serializer, a viewset, or a route — that is chunk 02, and adding it here
  makes this chunk unverifiable on its own.
- Add fields for severity, status strings, tags, votes, assignees, replies, or
  attachments (B2, B8).
- Add a second timestamp for "when the thought occurred".
- Touch `observations/`, `catalog/`, `protocols/` or `accounts/`.
- Hand-edit `docs/schema.dbml`.
- Change anything under `frontend-web/`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes, so every
screen looks and behaves exactly as it did before.

What changes is what the app is *capable* of: there is now a table a note can be
written to, and — for whoever holds the admin login, which on this app is the
same person using it — a screen at `/admin/feedback/feedbacknote/` where notes
can be read, filtered by kind, searched, and marked resolved. It is empty until
chunk 03.5 gives the app a way to write one.
