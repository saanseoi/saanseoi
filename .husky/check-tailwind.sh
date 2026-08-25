#!/usr/bin/env sh

# Tailwind's upgrader is a mutating migration command. Run it in a disposable
# clean worktree for every relevant pushed commit, then reject the push when it
# finds canonicalisations to commit. This must never write into the developer's
# working tree, which may contain unrelated in-progress work.
set -eu

ZERO_OID=0000000000000000000000000000000000000000
REPO_ROOT=$(git rev-parse --show-toplevel)
CHECK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/saanseoi-tailwind.XXXXXX")
CHECK_OIDS="$CHECK_DIR/local-oids"
CURRENT_WORKTREE=
PUSH_RECORDS=0

cleanup() {
  if [ -n "$CURRENT_WORKTREE" ]; then
    git worktree remove --force "$CURRENT_WORKTREE" >/dev/null 2>&1 || true
  fi
  rm -rf "$CHECK_DIR"
}
trap cleanup EXIT HUP INT TERM

: > "$CHECK_OIDS"

while read -r local_ref local_oid remote_ref remote_oid
do
  [ -n "${local_oid:-}" ] || continue
  PUSH_RECORDS=1

  # Deleting a remote ref does not push a local commit to validate.
  if [ "$local_oid" = "$ZERO_OID" ]; then
    continue
  fi

  # A new remote ref has no reliable local base to compare against. Check it
  # conservatively; ordinary updates use the exact pushed range below.
  if [ "$remote_oid" = "$ZERO_OID" ] || \
    ! git diff --quiet "$remote_oid" "$local_oid" -- apps/atlas-app package.json bun.lock; then
    if ! grep -Fqx "$local_oid" "$CHECK_OIDS"; then
      printf '%s\n' "$local_oid" >> "$CHECK_OIDS"
    fi
  fi
done

[ "$PUSH_RECORDS" -eq 1 ] || exit 0

if [ ! -s "$CHECK_OIDS" ]; then
  echo "No Tailwind-affected files in the pushed range; skipping canonical class check."
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required to install Tailwind checks in the disposable worktree." >&2
  exit 1
fi

TAILWIND_FAILURES=0
CHECK_INDEX=0

while IFS= read -r local_oid
do
  CHECK_INDEX=$((CHECK_INDEX + 1))
  CURRENT_WORKTREE="$CHECK_DIR/worktree-$CHECK_INDEX"
  # A normal `worktree add` runs the repository's post-checkout hook, which
  # provisions local files and databases. This disposable check must not do
  # either, so disable hooks for its checkout explicitly.
  git -c core.hooksPath=/dev/null worktree add --detach "$CURRENT_WORKTREE" "$local_oid" >/dev/null

  # The Tailwind upgrader follows CSS imports and can rewrite package CSS.
  # Install an isolated dependency tree here rather than sharing the
  # developer's node_modules through a symlink.
  if ! (
    cd "$CURRENT_WORKTREE"
    bun install --frozen-lockfile --ignore-scripts >/dev/null
  ); then
    echo "Could not install dependencies for the disposable Tailwind check." >&2
    exit 1
  fi

  UPGRADE_BIN="$CURRENT_WORKTREE/node_modules/.bin/upgrade"
  if [ ! -x "$UPGRADE_BIN" ]; then
    echo "Tailwind upgrader is not installed at $UPGRADE_BIN." >&2
    exit 1
  fi

  echo "Checking Tailwind canonical class names..."
  if ! (
    cd "$CURRENT_WORKTREE"
    "$UPGRADE_BIN" --force apps/atlas-app/src/routes/app.css
  ); then
    exit 1
  fi

  TAILWIND_CHANGES=$(git -C "$CURRENT_WORKTREE" status --porcelain | sed '/^?? node_modules$/d')
  if [ -n "$TAILWIND_CHANGES" ]; then
    echo
    echo "Tailwind found canonicalised files for $local_oid. Commit these changes before pushing."
    echo
    echo "Changed files:"
    printf '%s\n' "$TAILWIND_CHANGES" | sed 's/^/  - /'
    TAILWIND_FAILURES=1
  fi

  git worktree remove --force "$CURRENT_WORKTREE" >/dev/null
  CURRENT_WORKTREE=
done < "$CHECK_OIDS"

if [ "$TAILWIND_FAILURES" -ne 0 ]; then
  exit 1
fi

echo "Tailwind canonical class check passed."
