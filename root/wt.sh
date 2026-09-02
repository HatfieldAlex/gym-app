# wt — jump between git worktrees of the current repo.
#
#   wt                 list worktrees (current one marked *)
#   wt <name>          cd to that worktree, keeping your relative subdir if it exists
#   wt -               cd to the previous worktree you were in
#   wt <name> <cmd>... run cmd in that worktree without changing your shell's dir
#
# Name matching: exact dir/branch name first, then unique prefix, then unique substring.

_wt_list() {
  # skip the bare repo entry (the .bare dir in a bare-repo worktree layout)
  git worktree list --porcelain 2>/dev/null |
    awk '/^worktree /{p=substr($0,10); next} /^bare$/{p=""} /^$/{if(p)print p; p=""} END{if(p)print p}'
}

wt() {
  local root paths p name target rel cur

  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "wt: not inside a git repository" >&2
    return 1
  fi

  mapfile -t paths < <(_wt_list)
  if [ ${#paths[@]} -eq 0 ]; then
    echo "wt: no worktrees found" >&2
    return 1
  fi

  # Which worktree are we in right now?
  cur=$(git rev-parse --show-toplevel 2>/dev/null)

  # No args: list them.
  if [ $# -eq 0 ]; then
    for p in "${paths[@]}"; do
      local branch
      branch=$(git -C "$p" rev-parse --abbrev-ref HEAD 2>/dev/null)
      if [ "$p" = "$cur" ]; then
        printf '* %-28s %s\n' "$(basename "$p")" "$branch"
      else
        printf '  %-28s %s\n' "$(basename "$p")" "$branch"
      fi
    done
    return 0
  fi

  name=$1; shift

  # wt -  → previous worktree
  if [ "$name" = "-" ]; then
    if [ -z "$WT_PREV" ]; then
      echo "wt: no previous worktree" >&2
      return 1
    fi
    target=$WT_PREV
  else
    # 1. exact basename or branch match
    for p in "${paths[@]}"; do
      if [ "$(basename "$p")" = "$name" ] ||
         [ "$(git -C "$p" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$name" ]; then
        target=$p; break
      fi
    done
    # 2. unique prefix, then 3. unique substring
    if [ -z "$target" ]; then
      local mode matches
      for mode in prefix substr; do
        matches=()
        for p in "${paths[@]}"; do
          local b; b=$(basename "$p")
          if [ "$mode" = prefix ]; then
            [[ $b == "$name"* ]] && matches+=("$p")
          else
            [[ $b == *"$name"* ]] && matches+=("$p")
          fi
        done
        if [ ${#matches[@]} -eq 1 ]; then target=${matches[0]}; break; fi
        if [ ${#matches[@]} -gt 1 ]; then
          echo "wt: '$name' is ambiguous:" >&2
          printf '  %s\n' "${matches[@]##*/}" >&2
          return 1
        fi
      done
    fi
  fi

  if [ -z "$target" ]; then
    echo "wt: no worktree matching '$name'. Available:" >&2
    printf '  %s\n' "${paths[@]##*/}" >&2
    return 1
  fi

  # wt <name> <cmd>... → run there, don't move the shell
  if [ $# -gt 0 ]; then
    ( cd "$target" && "$@" )
    return $?
  fi

  # Keep the same relative subdirectory when the other worktree has it.
  rel=""
  if [ -n "$cur" ] && [[ $PWD == "$cur"/* ]]; then
    rel=${PWD#"$cur"/}
  fi

  WT_PREV=$cur
  if [ -n "$rel" ] && [ -d "$target/$rel" ]; then
    cd "$target/$rel" || return 1
  else
    cd "$target" || return 1
  fi
}

_wt_complete() {
  local cur_word=${COMP_WORDS[COMP_CWORD]}
  # only complete the first argument
  if [ "$COMP_CWORD" -eq 1 ]; then
    local names
    names=$(_wt_list | while read -r p; do basename "$p"; done)
    mapfile -t COMPREPLY < <(compgen -W "$names -" -- "$cur_word")
  fi
}
complete -F _wt_complete wt
