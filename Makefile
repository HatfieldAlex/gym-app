# ---------------------------------------------------------------------------
# gym-app — local development
#
#   make run
#
# is the whole story: it brings up the Django API on :8000 and the Vite dev
# server on :5173, then leaves them running until you hit Ctrl-C. Open
# http://localhost:5173 and play. Vite proxies /api and /admin through to
# Django, so the browser sees a single origin and the session cookie works.
#
# Everything else in this file exists to make that one command work from a
# clean checkout: the virtualenv, the pip and npm installs, the migrations.
# ---------------------------------------------------------------------------

# `kill 0`, `wait -n` and trap-based cleanup below are bash, not POSIX sh.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

PYTHON ?= python3

BACKEND := backend
WEB     := frontend-web
VENV    := .venv
# Absolute: the recipes below cd into backend/, and a relative interpreter path
# makes CPython warn that sys.prefix isn't where it expects.
VENV_PY := $(CURDIR)/$(VENV)/bin/python

# Touched after a successful install so the next `make run` skips the work.
PIP_STAMP := $(VENV)/.requirements.stamp
NPM_STAMP := $(WEB)/node_modules/.install.stamp

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
WEB_PORT     ?= 5173

# Everything in root/ is published as a symlink into the worktree container —
# the directory above this one, which holds .bare/ and every worktree. See
# `make root-links` at the foot of this file.
ROOTDIR   := root
CONTAINER := $(CURDIR)/..

.DEFAULT_GOAL := help
.PHONY: help run run-backend run-web install migrate superuser dummy-data shell build serve test clean root-links

# Extra flags for `make dummy-data`, e.g. ARGS="--weeks 4 --users 5".
ARGS ?=

help:
	@echo "gym-app"
	@echo
	@echo "  make run          both servers, ready at http://localhost:$(WEB_PORT)"
	@echo "  make run-backend  the Django API alone, on :$(BACKEND_PORT)"
	@echo "  make run-web      the Vite dev server alone, on :$(WEB_PORT)"
	@echo
	@echo "  make install      virtualenv + pip + npm, without starting anything"
	@echo "  make migrate      apply Django migrations"
	@echo "  make superuser    create an admin login"
	@echo "  make dummy-data   fill the database with athletes and months of workouts"
	@echo "                    (ARGS=\"--weeks 4 --users 5 --append\")"
	@echo "  make shell        Django shell inside the virtualenv"
	@echo "  make test         Django test suite"
	@echo
	@echo "  make build        production frontend bundle into $(WEB)/dist"
	@echo "  make serve        build, then serve it from Django alone on :$(BACKEND_PORT)"
	@echo "  make clean        remove the virtualenv, node_modules and dist"

# --- the one you want --------------------------------------------------------

# Both servers in one terminal. The trap tears the other one down when either
# dies (or when you Ctrl-C), so you never leave a stray runserver holding :8000.
run: install migrate
	@echo
	@echo "  API  → http://$(BACKEND_HOST):$(BACKEND_PORT)/api/v1/"
	@echo "  app  → http://localhost:$(WEB_PORT)"
	@echo "  (Ctrl-C stops both)"
	@echo
	@trap 'trap - INT TERM EXIT; kill 0 2>/dev/null; exit 0' INT TERM EXIT; \
	  ( cd $(BACKEND) && exec $(VENV_PY) manage.py runserver $(BACKEND_HOST):$(BACKEND_PORT) ) & \
	  ( cd $(WEB) && exec npm run dev -- --port $(WEB_PORT) --strictPort ) & \
	  wait -n

run-backend: $(PIP_STAMP) migrate
	cd $(BACKEND) && exec $(VENV_PY) manage.py runserver $(BACKEND_HOST):$(BACKEND_PORT)

run-web: $(NPM_STAMP)
	cd $(WEB) && exec npm run dev -- --port $(WEB_PORT) --strictPort

# --- setup -------------------------------------------------------------------

install: $(PIP_STAMP) $(NPM_STAMP)

$(VENV_PY):
	@command -v $(PYTHON) >/dev/null || { echo "error: $(PYTHON) not found on PATH"; exit 1; }
	$(PYTHON) -m venv $(VENV)
	$(VENV_PY) -m pip install --quiet --upgrade pip

$(PIP_STAMP): $(BACKEND)/requirements.txt | $(VENV_PY)
	$(VENV_PY) -m pip install -r $(BACKEND)/requirements.txt
	@touch $@

$(NPM_STAMP): $(WEB)/package.json $(WEB)/package-lock.json
	@command -v npm >/dev/null || { echo "error: npm not found on PATH — install Node.js"; exit 1; }
	cd $(WEB) && npm install
	@touch $@

migrate: $(PIP_STAMP)
	cd $(BACKEND) && $(VENV_PY) manage.py migrate

superuser: $(PIP_STAMP)
	cd $(BACKEND) && $(VENV_PY) manage.py createsuperuser

# Something to look at: a few athletes, a few months of sessions, sets that get
# heavier week by week, and one session left open. Replaces the seeded users'
# previous sessions and leaves everyone else's alone; --append keeps them.
dummy-data: migrate
	cd $(BACKEND) && $(VENV_PY) manage.py seed_dummy_data $(ARGS)

shell: $(PIP_STAMP)
	cd $(BACKEND) && $(VENV_PY) manage.py shell

test: $(PIP_STAMP)
	cd $(BACKEND) && $(VENV_PY) manage.py test

# --- production shape --------------------------------------------------------

# `npm run build` writes dist/ with base '/static/'; Django picks up the shell
# at dist/index.html and the hashed bundles through STATICFILES_DIRS.
build: $(NPM_STAMP)
	cd $(WEB) && npm run build

serve: build migrate
	@echo
	@echo "  app → http://$(BACKEND_HOST):$(BACKEND_PORT)  (built bundle, Django alone)"
	@echo
	cd $(BACKEND) && exec $(VENV_PY) manage.py runserver $(BACKEND_HOST):$(BACKEND_PORT)

# --- the worktree container --------------------------------------------------

# Publish the *contents* of root/ into the container directory as symlinks, so
# files that describe the whole checkout (its README, the `wt` switcher) sit
# where you actually stand — beside .bare/ and the worktrees — while remaining
# tracked here on a branch. The container is outside every worktree, so a real
# file there would be invisible to git.
#
# Links are relative ($(notdir $(CURDIR))/root/x), so the container can be moved
# or renamed wholesale without breaking them. Re-run after adding or deleting
# anything in root/; it is idempotent.
root-links:
	@set -eu; \
	container=$$(cd $(CONTAINER) && pwd); \
	here=$$(basename $(CURDIR)); \
	if [ ! -e "$$container/.bare" ]; then \
	  echo "make: $$container is not a worktree container (no .bare) — nothing done" >&2; \
	  exit 1; \
	fi; \
	for src in $(ROOTDIR)/*; do \
	  [ -e "$$src" ] || continue; \
	  name=$$(basename "$$src"); dest="$$container/$$name"; \
	  if [ -e "$$dest" ] && [ ! -L "$$dest" ]; then \
	    echo "  skip    $$name (a real file is already there)" >&2; continue; \
	  fi; \
	  ln -sfn "$$here/$(ROOTDIR)/$$name" "$$dest"; \
	  echo "  link    $$name -> $$here/$(ROOTDIR)/$$name"; \
	done; \
	for link in "$$container"/*; do \
	  [ -L "$$link" ] || continue; \
	  target=$$(readlink "$$link"); \
	  case "$$target" in */$(ROOTDIR)/*) ;; *) continue ;; esac; \
	  if [ ! -e "$$container/$$target" ]; then \
	    rm "$$link"; echo "  prune   $$(basename "$$link") (target is gone)"; \
	  fi; \
	done

# --- housekeeping ------------------------------------------------------------

clean:
	rm -rf $(VENV) $(WEB)/node_modules $(WEB)/dist
