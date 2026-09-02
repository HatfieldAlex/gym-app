# Deploying

The app runs on Heroku as a single web dyno: gunicorn serves the Django API,
the admin, and the built React bundle from one origin, which is what the
session cookie needs. There is no separate frontend host and no CORS.

    heroku app:  gym-app-prod  (eu)
    url:         https://gym-app-prod-5289d471fd73.herokuapp.com/

## What is in the repository for Heroku's benefit

Heroku detects a project by the files in its root, and this project keeps its
two halves in `backend/` and `frontend-web/`. The four files below are the
adapters between those two facts; none of them affect `make run`.

| File | Why it exists |
| --- | --- |
| `package.json` | The Node buildpack detects on it. Its `build` script installs and builds `frontend-web/`, then deletes that `node_modules` so it does not ride along in the slug. |
| `requirements.txt` | The Python buildpack detects on it. It is one `-r backend/requirements.txt` line; the dependency list itself has one home. |
| `.python-version` | Pins the runtime. |
| `bin/post_compile` | Runs `collectstatic` at the end of the build. It cannot go in the release phase: that filesystem is discarded. |
| `Procfile` | `release:` migrates, `web:` starts gunicorn. |

The buildpack order matters and is set on the app: **Node first, then Python**,
so that `frontend-web/dist/` exists by the time `collectstatic` looks for it.

## Config vars

`backend/settings/settings.py` reads each of these from the environment and
falls back to the development answer when it is unset, so a checkout with an
empty environment is still a working `make run`.

| Var | Set to | Effect |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | a generated 64-char value | Signs sessions and CSRF tokens. |
| `DJANGO_DEBUG` | `False` | Also switches on the hardening block at the foot of settings: HTTPS redirect, secure cookies, HSTS, and JSON-only DRF responses. |
| `DJANGO_ALLOWED_HOSTS` | the app's hostname | Becomes `ALLOWED_HOSTS`, and `CSRF_TRUSTED_ORIGINS` is derived from it. **A custom domain has to be added here**, comma-separated, or every POST from it is rejected. |
| `DATABASE_URL` | *(set by the add-on)* | Its presence is what switches the app off SQLite and onto Postgres. |

## Plans

* **One Basic web dyno** — $7/month, 512 MB, always awake. `eco` is the one
  tier below it at $5/month for 1,000 dyno-hours shared across the whole
  account, but it needs an account-level Eco subscription enabled from the
  dashboard, and an Eco dyno sleeps after 30 minutes without traffic. Switching
  is `heroku ps:type eco -a gym-app-prod` once that subscription exists.
* **`heroku-postgresql:essential-0`** — $5/month, the cheapest Postgres tier:
  1 GB, 20 connections. No follower and no rollback, so `pg:backups` capture is
  the whole backup story.

## Deploying a change

    git push heroku <branch>:main

Each push builds a new slug, runs `migrate` in the release phase, and swaps the
dyno over. A failing migration aborts the release and the previous version
keeps serving.

    heroku logs --tail -a gym-app-prod
    heroku run 'cd backend && python manage.py createsuperuser' -a gym-app-prod
    heroku pg:info -a gym-app-prod

## Known gap

`manage.py check --deploy` reports `mail.E001`: `MAILERS` still uses the console
backend. Nothing in the app sends mail today, so this is latent rather than
broken — but anything that starts to (a password reset, say) needs a real SMTP
backend configured here first, or it will quietly write to the dyno's stdout.
