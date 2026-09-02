# Worktrees

This project is not checked out the usual way. Instead of one working copy that
you switch branches inside of, every branch has its own directory, all sharing a
single object store:

    ~/Projects/gym-app/
    ├── .bare/                     the repository itself (bare, no working copy)
    ├── .git                       one line: `gitdir: ./.bare`
    ├── wt.sh                      the directory switcher, see below
    ├── README.md                  symlink to this file
    ├── main/                      worktree, branch `main`
    ├── deployment/                worktree, branch `deployment`
    ├── enhance-current-exercise/  worktree, branch `enhance-current-exercise`
    └── experiment/                worktree, branch `experiment`

Each of those directories is a complete checkout — `main/Makefile`,
`main/backend/`, `main/frontend-web/` and so on — and `make run` works from any
of them. `git worktree list` is the authoritative view:

    $ git worktree list
    /home/a/Projects/gym-app/.bare                     (bare)
    /home/a/Projects/gym-app/deployment                5a00a0c [deployment]
    /home/a/Projects/gym-app/enhance-current-exercise  7b2b107 [enhance-current-exercise]
    /home/a/Projects/gym-app/experiment                7b2b107 [experiment]
    /home/a/Projects/gym-app/main                      da8159a [main]

## Why this layout

The thing it buys is that **a branch keeps its build state**. This project has a
`.venv/` and a `frontend-web/node_modules/` — both gitignored, both slow to
rebuild, and both sensitive to what the branch's `requirements.txt` and
`package.json` say. Under a single checkout, `git switch` leaves those
directories behind, holding whatever the *previous* branch installed, and a
branch that adds a dependency quietly runs against the wrong tree until you
remember to reinstall. Here each worktree owns its own, so switching is free and
nothing is stale.

The rest follows from that:

* A dev server can stay up on one branch while you work on another — the
  checkout is no longer the thing in the way. Two *full* `make run`s at once
  still collide on ports 8000 and 5173. The Vite half moves freely (`make run
  WEB_PORT=5174`), but `BACKEND_PORT` cannot be overridden on its own: the dev
  proxy target is hardcoded as `DJANGO` at the top of
  `frontend-web/vite.config.js`, so a second backend needs that line changed
  too, on that branch, or its frontend proxies to the other worktree's API.
* No stash-shuffle to look at another branch, and no half-finished work blocking
  a switch.
* A diff between branches is a diff between two directories, so an editor,
  `diff -r`, or a second IDE window all work on it directly.

The cost is disk. Each worktree carries its own `.venv/` and `node_modules/`,
which is why `experiment/` currently has neither — it has not had `make run` run
in it yet. Nothing needs doing about that; the first `make run` there builds
them.

The `.bare/` directory holds the git objects once, not once per branch, and the
`.git` file at the root points at it. `origin` and the `heroku` remote are
configured there, so a fetch in any worktree updates all of them.

## Switching between them: `wt`

`wt.sh` at the repository root defines a `wt` shell function. From anywhere
inside any worktree:

| Command | Effect |
| --- | --- |
| `wt` | List the worktrees and their branches; `*` marks the one you are in. |
| `wt deployment` | Switch to that worktree. |
| `wt dep`, `wt enh` | Same, by unique prefix — or unique substring. Ambiguous input lists the candidates instead of guessing. |
| `wt <Tab>` | Completes worktree names. |
| `wt -` | Back to the worktree you came from. |
| `wt main npm test` | Run a command *in* another worktree without moving your shell. |

Two behaviours worth knowing. It **keeps your relative subdirectory**: from
`main/frontend-web/src`, `wt deployment` lands in
`deployment/frontend-web/src`, falling back to the worktree root when that path
does not exist on the other branch. And it reads `git worktree list` every time
rather than hardcoding anything, so a worktree added tomorrow is switchable
immediately, and the function works in any other repository that uses worktrees.

### Installing it

It has to be **sourced**, not executed. A script run as a subprocess cannot
change the directory of the shell that launched it — the `cd` dies with the
child process — which is also why this is not a `make` target. One line in
`~/.bashrc`:

    [ -f ~/Projects/gym-app/wt.sh ] && . ~/Projects/gym-app/wt.sh

The `[ -f ]` guard means a shell still starts cleanly if the repository is moved
or deleted. `source ~/.bashrc` or open a new terminal to pick it up.

`wt.sh` sits at the repository root, which is the worktree *container* and so is
not inside any working tree — the file is therefore **not tracked by git**. That
is deliberate, to keep the whole arrangement in one directory, but it does mean
it is not backed up with the code. Moving it to `main/scripts/` and sourcing it
from there would version it, at the cost of tying it to one worktree.

## Recreating the layout from scratch

    git clone --bare https://github.com/HatfieldAlex/gym-app gym-app/.bare
    cd gym-app
    echo 'gitdir: ./.bare' > .git

A bare clone sets no remote-tracking refspec, so teach it one before fetching,
otherwise `origin/*` never appears:

    git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
    git fetch origin

Then one directory per branch:

    git worktree add main main
    git worktree add deployment deployment
    git worktree add experiment -b experiment origin/main   # new branch

Copy `wt.sh` in and add the `~/.bashrc` line above.

## Day-to-day

    git worktree add <dir> <existing-branch>     # check out a branch beside the others
    git worktree add <dir> -b <new-branch>       # branch off HEAD into a new directory
    git worktree remove <dir>                    # delete it (refuses if dirty)
    git worktree prune                           # tidy up after a manually deleted dir

A branch can only be checked out in one worktree at a time — `git worktree add`
refuses a branch that is already out somewhere else, and names the directory
holding it. That is the rule behind most surprises here; `wt` to that directory
rather than trying to check the branch out twice.

Deleting a worktree directory with `rm -rf` leaves a stale administrative entry
under `.bare/worktrees/`. It is harmless, and `git worktree prune` clears it,
but `git worktree remove` avoids the situation altogether.

Deploying is unchanged by any of this — `git push heroku <branch>:main` from
whichever worktree holds the branch. See `main/docs/deploying.md`.

---

*This file describes the container, not the branch it happens to live on. It is
tracked on `main` — so it is version-controlled, reviewable, and survives a
re-clone — and surfaced at the container root as the `README.md` symlink, which
is where you are standing when you need it. Edit it at
`main/docs/worktrees.md`; both paths are the same file.*
