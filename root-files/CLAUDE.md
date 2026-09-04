# gym-app

A Django API and a React frontend, checked out as **one git worktree per
branch**: `.bare/` is the repository, every sibling directory is a branch, and
`wt <name>` moves between them. [README.md](README.md) is the full account —
read it before running any `git worktree` command or wondering why `git switch`
is not the tool here.

`make help` in any worktree lists everything; `make run` brings up both servers.

## Any change to this app follows the iteration flow

**Read [iteration-flow.md](iteration-flow.md) and work to it.** A new feature, a
bug, a refactor, a round of polish — all of them run the same seven-stage loop,
one fresh subagent per stage, and that file is the authority on it rather than a
suggestion. Do not improvise a shorter route because a change looks small; a
small change gets a small spec, not a skipped one.

Three things it exists to stop:

1. **Building from a one-line request.** Stage ① is an interrogation, and it
   comes before anything else — scope, non-scope, and what counts as done, all
   written and agreed to by the human. A bug is not started until its
   reproduction is pinned down.
2. **Work landing straight on `main`.** It happens on its own branch in its own
   worktree and reaches `main` as a **pull request**, never as a commit an agent
   made on `main` and never as a merge an agent performed.
3. **Merging its own pull request.** ⑥ is the human's alone — the reading, the
   running, and the merge. It is not to be performed, inferred, or assumed to
   have happened. An agent opens the PR at ⑤ and stops: no approving, no
   merging, no auto-merge. Tearing down (⑦) starts only once the merge has
   actually landed in `origin/main` — and it deletes things, so a refusal from
   `git worktree remove` or `git branch -d` is reported, never forced past.

**What is not an iteration:** a question about the code, a file to read, an
explanation, a look at what a command does. Answer those directly. The loop is
for changes to the app.

---

*This file sits at the worktree container, above every worktree, so it applies
in all of them. It is tracked at `main/root-files/CLAUDE.md` and published here
as a symlink by `make root-links`; edit it at the tracked path.*
