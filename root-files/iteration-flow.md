# One iteration

One round of work, start to finish: a rough intention is interrogated into a
spec, the spec is built on its own branch in its own worktree, the human reviews
it by hand, and the branch is then folded back into `main` and the worktree
taken away again.

**Whatever the work is.** A new feature, a bug the human has just hit, a
refactor, a round of polish, an experiment likely to be thrown away — they all
run this same loop. The only thing that changes is what ① is digging for and how
many chunks ③ comes back with; a one-line fix gets a one-chunk spec, and that is
fine.

Every stage below is a **fresh subagent**. Nothing is carried between them in
anyone's head — each stage leaves a written artefact (an agreed description, a
worktree, a directory of specs, a diff) and the next stage starts cold from it.
That is the point: a stage that comes out wrong is redone by re-running that
stage, not by unpicking everything after it.

There is exactly **one manual gate**, and it belongs to the human: nothing is
committed, pushed or merged until the human has read the code and said so.

> **Who `HUMAN` is.** This file is addressed to agents, so it names its actors
> rather than saying "you". `HUMAN` is the person whose app this is — the one
> the agent is working for. Every other actor named here is an agent. The three
> `HUMAN` steps in the diagram below are the ones no agent may do on their
> behalf, and no agent may move past them unprompted.

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
    │   git worktree add <name> -b <name>, beside the others, then     │
    │   make install in it. The layout does the rest.                  │
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
    │ ⑤ HAND BACK                                             subagent │
    │                                                                  │
    │   Tell the human it is done, and what to look at: the branch,    │
    │   the worktree, the specs built, anything left undone. Stop.     │
    └────────────────────────────────┬─────────────────────────────────┘
                                     │
  ══════════════════════════════════ ▼ ═══════════════════════════════════
   ⑥  THE HUMAN REVIEWS IT — in person, with no agent standing in. Reads
       the diff, runs it. Happy: commits on that branch, in that worktree,
       in their own words. Not happy: says so, and the flow goes back to ③
       or ④ rather than forward. NO AGENT GOES PAST THIS LINE UNBIDDEN.
  ══════════════════════════════════ ▼ ═══════════════════════════════════
                                     │
                      ⑦  HUMAN: "committed, go ahead"
                                     │
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ⑧ PUBLISH                                               subagent │
    │                                                                  │
    │   git push -u origin <name>     the branch, as its own branch    │
    │   git merge <name>              into main, locally, from main/   │
    │   git push origin main          main, up to GitHub               │
    └────────────────────────────────┬─────────────────────────────────┘
                     main contains the work, everywhere
    ┌────────────────────────────────▼─────────────────────────────────┐
    │ ⑨ TEAR DOWN                                             subagent │
    │                                                                  │
    │   git worktree remove <name>    the directory, its .venv and     │
    │   git branch -d <name>          its node_modules, and the branch │
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
| ⑤ | [Hand back](#-hand-back) | subagent | that code | the **human**, told it is ready |
| ⑥ | [Review](#-the-humans-review) | **the human, alone** | that code | a commit — or a trip back to ③ |
| ⑦ | Go-ahead | **the human** | that commit | permission to publish it |
| ⑧ | [Publish](#-publish) | subagent | the human's commit | the branch on GitHub, merged into `main` |
| ⑨ | [Tear down](#-tear-down) | subagent | a merged branch | nothing, which is the idea |

Five of the nine are an agent's to run unattended. ⑥ and ⑦ are not, and ① is
only half — the questions are an agent's, the answers are not.

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

Nothing is committed here. The whole iteration arrives as one uncommitted
working tree, so the review gate sees it whole.

### ⑤ Hand back

Tell **the human** it is done, and say what to look at: the branch, the worktree
to `wt` into, which chunks landed, anything that came out differently from the
spec, anything skipped. Then stop, and wait to be spoken to.

### ⑥ The human's review

**This stage is the human's, and no agent may do it, stand in for it, or skip
it.** An agent reading this file has finished its work at ⑤ and starts again at
⑧, on being told to.

What it consists of: `wt <name>`, reading the diff, `make run`, poking at the
thing. The human commits on that branch once happy — their commit, their
message, their judgement of what "happy" means. An agent's account of its own
work is not a review, and a green test suite is not one either.

If it is wrong, this is where it goes back: to ④ if a chunk was built badly, to
③ if the spec itself was wrong. Both are cheap, which is the whole reason the
work is split into chunks and kept off `main` until now.

### ⑦ Go-ahead

One sentence from the human, in their own words, saying the commit is made and
the branch can go out. Until it arrives, ⑧ has not started. Silence is not it,
and neither is an agent deciding the review must have gone fine.

### ⑧ Publish

Only once ⑦ has actually arrived. From the iteration's worktree:

    git push -u origin <name>

Then from `main/`:

    git merge <name>
    git push origin main

The branch goes up as itself *before* the merge, so the work has its own
history on GitHub independent of what `main` ends up looking like. The merge is
local and only then pushed — `main` on GitHub moves once, already containing
everything.

### ⑨ Tear down

    git worktree remove <name>     # refuses if anything is uncommitted
    git branch -d <name>           # refuses if not fully merged

Both refusals are the safety net, not an obstacle: `remove` protects work the
human forgot to commit, and `-d` protects a branch that did not actually make it
into `main`. If either refuses, stop and say so rather than forcing it — this is
the one stage that destroys something, and it is not the place to improvise.

`git branch -d` has to be run from another worktree — `main/` — because the
branch's own worktree is gone by then. The remote branch on GitHub is left
alone; it is the record of how the work was done.

---

*Tracked at `main/root-files/iteration-flow.md` and surfaced at the container
root as a symlink, like [README.md](README.md) and `wt.sh` — see the end of that
file for why. Edit it at the tracked path; both are the same file.*
