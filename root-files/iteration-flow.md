# One iteration

One round of work, start to finish: a rough intention is interrogated into a
spec, the spec is built on its own branch in its own worktree, the branch goes
up as a pull request, and the human reviews and merges that pull request before
the worktree is taken away again.

**Whatever the work is.** A new feature, a bug the human has just hit, a
refactor, a round of polish, an experiment likely to be thrown away — they all
run this same loop. The only thing that changes is what ① is digging for and how
many chunks ③ comes back with; a one-line fix gets a one-chunk spec, and that is
fine.

Every stage below is a **fresh subagent**. Nothing is carried between them in
anyone's head — each stage leaves a written artefact (an agreed description, a
worktree, a directory of specs, a pull request) and the next stage starts cold
from it. That is the point: a stage that comes out wrong is redone by re-running
that stage, not by unpicking everything after it.

There is exactly **one manual gate**, and it belongs to the human: it is the
merge button on the pull request. Everything before it an agent may run
unattended, because none of it touches `main`. Nothing after it happens until
the merge has actually landed.

> **Who `HUMAN` is.** This file is addressed to agents, so it names its actors
> rather than saying "you". `HUMAN` is the person whose app this is — the one
> the agent is working for. Every other actor named here is an agent. The two
> `HUMAN` steps in the diagram below — the answers at ① and the whole of ⑥ —
> are the ones no agent may do on their behalf, and no agent may move past them
> unprompted.

## The flow

```
                      HUMAN: an idea, a bug, or an itch
                                     │
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ① GRILL                                    subagent · then HUMAN │
    │                                                                  │
    │   Read the code that the idea touches, then come back with the   │
    │   questions that actually decide the shape of it. Put them to    │
    │   the human, and keep going until nothing is left vague.         │
    └────────────────────────────────┬─────────────────────────────────┘
            a name, and a description the human has signed off on
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ② WORKTREE                                              subagent │
    │                                                                  │
    │   git worktree add <name> -b <name> main, beside the others,     │
    │   then make install in it. The layout does the rest.             │
    └────────────────────────────────┬─────────────────────────────────┘
                   an empty branch with a working checkout
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ③ SPEC                                                  subagent │
    │                                                                  │
    │   specs/<name>/ — 00-context.md, numbered chunks small enough    │
    │   to hand over one at a time, and a README.md indexing them.     │
    └────────────────────────────────┬─────────────────────────────────┘
                    a directory of specs, in build order
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ④ BUILD                                       subagent per chunk │
    │                                                                  │
    │   "run these specs in order with a new subagent for each, and    │
    │    that subagent is empowered to use as many or as few           │
    │    subagents as they think is most effective"                    │
    └────────────────────────────────┬─────────────────────────────────┘
                   a working tree full of uncommitted work
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ⑤ SHIP                                                  subagent │
    │                                                                  │
    │   One commit for the whole iteration, the branch pushed, and a   │
    │   pull request opened against main. What the hand-back used to   │
    │   say goes in the PR body. Then stop — do not merge it.          │
    └────────────────────────────────┬─────────────────────────────────┘
                                     │
  ══════════════════════════════════ ▼ ═══════════════════════════════════
   ⑥  THE HUMAN REVIEWS THE PULL REQUEST — on GitHub, with no agent
       standing in. Reads the diff, pulls the branch, runs it. Happy:
       merges it, their own hand on the button. Not happy: says so, and
       the flow goes back to ③ or ④ rather than forward.
       NO AGENT MERGES ITS OWN PULL REQUEST.
  ══════════════════════════════════ ▼ ═══════════════════════════════════
                                     │
                             the merge, on main
                                     │
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ⑦ TEAR DOWN                                             subagent │
    │                                                                  │
    │   Watch for that merge — it is the trigger, and no sentence      │
    │   from the human is needed. Then bring main down, take the       │
    │   worktree and the branch away, and leave the root links         │
    │   pointing somewhere that still exists.                          │
    └──────────────────────────────────────────────────────────────────┘
                   back where it started, one iteration on
```

## The stages in detail

| # | Stage | Who does it | Starts from | Leaves behind |
|---|-------|-------------|-------------|---------------|
| ① | [Grill](#-grill) | subagent asks, **human** answers | a rough idea | a name and an agreed description |
| ② | [Worktree](#-worktree) | subagent | that name | `<name>/` on branch `<name>`, installed |
| ③ | [Spec](#-spec) | subagent | the description | `specs/<name>/` |
| ④ | [Build](#-build) | a subagent per chunk | those specs | uncommitted code on the branch |
| ⑤ | [Ship](#-ship) | subagent | that code | one commit, pushed, and an open pull request |
| ⑥ | [Review](#-the-humans-review) | **the human, alone** | that pull request | a merge — or a trip back to ③ |
| ⑦ | [Tear down](#-tear-down) | subagent | the merge | nothing, which is the idea |

Five of the seven are an agent's to run unattended. ⑥ is not, and ① is only
half — the questions are an agent's, the answers are not.

### ① Grill

A subagent that has read the relevant code first. Questions grounded in what is
actually there — which component this lives in, what happens to the existing
behaviour, what the API already returns — are worth several rounds of questions
that could have been asked about any app.

What it is digging for depends on what kind of iteration this is:

* **Something new** — what it is, what it deliberately is *not*, which screens
  it touches, what has to still work afterwards, what counts as done.
* **A bug** — what actually happened, on which screen, what the human expected
  instead, and the shortest reliable way to reproduce it. A bug whose repro is
  not pinned down here is a bug that gets "fixed" without being fixed.
* **A refactor or a piece of polish** — what is allowed to change and what must
  not, in behaviour and in appearance. The temptation to improve one more thing
  while in there is exactly what this stage is fencing off.

It comes back with the questions; they are then put to **the human** in the main
session and answered there, because a subagent cannot hold a conversation with
anyone. Loop until the answers are specific enough to build from. Nothing here
is answered on the human's behalf, and nothing is assumed because it seems
obvious — that is what this stage is for. It ends when there is a **name** and a
**paragraph the human has read and agreed with**, including what is out of
scope.

That paragraph is not just for ③. It is the first thing the human sees again at
⑥, because ⑤ puts it at the top of the pull request — so write it as something
worth reading twice.

The name is used three times and should be chosen once: the worktree directory,
the branch, and — in `snake_case` — the specs directory. So
`enhance-current-exercise` the branch, `specs/exercise_zone/` the specs.

### ② Worktree

From the container (the directory holding `.bare/` and every worktree):

    git worktree add <name> -b <name> main
    cd <name> && make install

`make install` builds that branch's own `.venv/` and `node_modules/`, and pulls
in `make root-links` on the way through. See [README.md](README.md) for why each
branch owns its build state. `make hooks` is already installed and covers new
worktrees automatically — it does not need re-running.

Branch from `main`, and from `main` as it is *now*: `git fetch origin` first if
anything might have merged since. A branch cut from a stale `main` turns into a
conflicted pull request at ⑥, which is the one place this flow cannot afford
friction.

The worktree is switchable with `wt <name>` the moment it exists.

### ③ Spec

`specs/<name>/`, following the shape the existing spec directories use:

* **`00-context.md`** — everything every chunk needs to know, once.
* **Numbered chunks** — `01-`, `02-`, `03.0-`, `03.5-`. Each names the files to
  read, states its own *done when*, lists what it must not touch, and describes
  what the user sees when it lands. Decimal numbers split a chunk that grew.
* **`README.md`** — the index: a table of chunk, what it touches, what it
  depends on, then the reasoning behind the order.

The test of a good split is that **every chunk leaves the app working**. A chunk
that only makes sense once the next one lands is two chunks pretending to be
one, and it takes the review gate down with it — nobody can review something
they cannot run.

Size the directory to the work, not to the format. The existing spec directories
are six or ten chunks because those were six- or ten-chunk features; a bug fix
may be `00-context.md` and a single chunk, and padding it out to look like the
others helps nobody. For a bug, `00-context.md` carries the reproduction and the
chunk carries the fix *and the test that fails without it* — that test is the
one thing a bug spec must not leave out.

### ④ Build

One subagent per chunk, in order, each starting cold from `00-context.md` plus
its own chunk. The prompt, verbatim:

> run these specs in order with a new subagent for each, and that subagent is
> empowered to use as many or as few subagents as they think is most effective

The delegation is deliberately left to them. A chunk that is one file and one
function does not need to be split; a chunk that spans the backend model, the
endpoint and the tests may well be three agents working at once. The chunk
author knows which; the orchestrator does not.

Nothing is committed here. Chunks land one after another into the same
uncommitted working tree, and ⑤ commits the lot in one go — so the pull request
is one diff, the way the human reads it.

### ⑤ Ship

Where the old flow stopped and waited, this one commits, pushes and opens the
pull request. It is still one uninterrupted piece of work handed over whole —
the handover is just a PR now instead of a sentence.

**One commit for the whole iteration.** Not one per chunk. Read the diff before
making it (`git status`, `git diff`) and check that what is there is the
iteration and nothing else — a stray `.venv`, a scratch file, a `console.log`
left in from ④ are all cheaper to catch here than in review.

    git add -A
    git commit -m "<name>: <one line saying what it does>"
    git push -u origin <name>

Then the pull request, against `main`:

    gh pr create --base main --head <name> \
        --title "<name>: <the same one line>" \
        --body-file <a scratch path outside the worktree>

Write the body to a scratch file **outside** the worktree, so it never shows up
in the diff it is describing.

**The body is the hand-back.** Everything the old ⑤ said out loud goes in it,
because the pull request is where the human now meets the work:

* the agreed description from ①, near enough verbatim — what this is, and what
  it deliberately is not;
* which chunks of `specs/<name>/` landed;
* anything that came out differently from the spec, and why;
* anything skipped, and anything the human should poke at by hand;
* how to run it: `wt <name>` and `make run`, plus any migration or seed step.

A body that says "implements the spec" wastes the one artefact this flow has for
carrying an agent's judgement to the human.

**Credentials.** The two halves of this stage are authenticated separately, on
purpose.

* **The push** travels over the repository's own SSH deploy key. Nothing to set
  up and nothing to pass — `git push` simply works.
* **`gh pr create`** needs a GitHub API credential, which a deploy key is not.
  It reads `GH_TOKEN` from the container's `.claude/settings.local.json`: a
  fine-grained PAT scoped to `gym-app` alone, with *Pull requests: read and
  write* and *Contents: **read-only***. Read-only is deliberate — the token
  that opens pull requests deliberately cannot write code, so the only way a
  change reaches `origin` is the deploy key, pushing a branch a human still has
  to merge.

If `gh auth status` reports no token — it expires, and someone may have revoked
it — **stop and say so** rather than reaching for something else. Push the
branch, hand the human the compare URL
(`https://github.com/HatfieldAlex/gym-app/compare/main...<name>?expand=1`) and
the body text to paste, and mention that `.claude/setup-gh-pr-auth.sh` issues a
fresh token in about a minute. Do not go looking for another credential, do not
fall back to `gh auth login`, and do not invent one.

**Then stop.** Opening the pull request is the end of the agent's turn. It does
not approve it, does not merge it, does not enable auto-merge, and does not
nudge. ⑦ is waiting on the human, and waiting is the correct behaviour.

### ⑥ The human's review

**This stage is the human's, and no agent may do it, stand in for it, or skip
it.** An agent reading this file has finished its work at ⑤ and starts again at
⑦, when the merge it is watching for arrives.

What it consists of: reading the diff on GitHub, `wt <name>` or `gh pr checkout
<n>` to pull it down, `make run`, poking at the thing. The human merges it when
happy — their judgement of what "happy" means, their hand on the button. An
agent's account of its own work is not a review, and a green test suite is not
one either.

If it is wrong, this is where it goes back: to ④ if a chunk was built badly, to
③ if the spec itself was wrong. Both are cheap, which is the whole reason the
work is split into chunks and kept off `main` until now. Fixes go on the same
branch and are pushed to the same pull request — the one-commit rule is about
the *first* push, not a reason to rewrite history under a review in progress.
Each round of fixes is its own commit, so the human can see what changed since
they last looked.

### ⑦ Tear down

**The trigger is the merge itself**, not a sentence from the human. Having
opened the pull request, the agent watches for it to land:

    git fetch origin
    git merge-base --is-ancestor <name> origin/main   # true once it is in

or, with `gh` available, `gh pr view <n> --json state,mergedAt`. Poll gently —
this is a human reading a diff, not a build. If the session ends before the
merge does, teardown becomes the first thing the next session does: `git
worktree list` against what is already in `origin/main` shows exactly which
worktrees are owed a teardown.

Once it has landed, from `main/`:

    git pull                       # main, up to date, symlinks re-pointed
    git worktree remove <name>     # refuses if anything is uncommitted
    git branch -d <name>           # refuses if not fully merged

Pull **first**. ② pointed the container's root symlinks at the worktree that is
about to be deleted, and the `post-merge` hook re-points them at `main/` on the
way through — removing the worktree first leaves `CLAUDE.md`, `README.md` and
`iteration-flow.md` at the container root dangling. If they are dangling anyway,
`make root-links` from `main/` puts them back.

Both refusals are the safety net, not an obstacle: `remove` protects work the
human forgot to commit, and `-d` protects a branch that did not actually make it
into `main`. If either refuses, stop and say so rather than forcing it — this is
the one stage that destroys something, and it is not the place to improvise.

The one refusal with a known cause: `-d` will refuse after a **squash** merge,
because the branch's commit is genuinely not an ancestor of `main`. Confirm the
work really did land — `git cherry main <name>` prints nothing, or the squashed
commit is there in `git log main` — say which check was run, and only then use
`-D`. A refusal for any other reason is reported, not overridden.

`git branch -d` has to be run from another worktree — `main/` — because the
branch's own worktree is gone by then. The remote branch on GitHub is left
alone; it is the record of how the work was done, and the pull request points
at it.

---

*Tracked at `main/root-files/iteration-flow.md` and surfaced at the container
root as a symlink, like [README.md](README.md) and `wt.sh` — see the end of that
file for why. Edit it at the tracked path; both are the same file.*
