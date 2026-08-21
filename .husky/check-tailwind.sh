#!/usr/bin/env sh

# Tailwind's upgrader is a mutating migration command. Run it against the
# files involved in this push, then reject the push if it changed the working
# tree or index so its canonicalisation cannot be silently omitted from the
# commit.
set -eu

ZERO_OID=0000000000000000000000000000000000000000
TAILWIND_RELEVANT_PUSH=0
PUSH_RECORDS=0

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
  if [ "$remote_oid" = "$ZERO_OID" ]; then
    TAILWIND_RELEVANT_PUSH=1
    continue
  fi

  if ! git diff --quiet "$remote_oid" "$local_oid" -- apps/atlas-app package.json bun.lock; then
    TAILWIND_RELEVANT_PUSH=1
  fi
done

[ "$PUSH_RECORDS" -eq 1 ] || exit 0

if [ "$TAILWIND_RELEVANT_PUSH" -eq 0 ]; then
  echo "No Tailwind-affected files in the pushed range; skipping canonical class check."
  exit 0
fi

CHECK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/saanseoi-tailwind.XXXXXX")
cleanup() {
  rm -rf "$CHECK_DIR"
}
trap cleanup EXIT HUP INT TERM

# Compare both diffs separately. This catches edits to staged files as well as
# edits to files that were already dirty before the hook started.
git diff --binary > "$CHECK_DIR/before-worktree.patch"
git diff --cached --binary > "$CHECK_DIR/before-index.patch"

echo "Checking Tailwind canonical class names..."
set +e
bun x @tailwindcss/upgrade --force apps/atlas-app/src/routes/app.css
TAILWIND_STATUS=$?
set -e

if [ "$TAILWIND_STATUS" -ne 0 ]; then
  exit "$TAILWIND_STATUS"
fi

git diff --binary > "$CHECK_DIR/after-worktree.patch"
git diff --cached --binary > "$CHECK_DIR/after-index.patch"

if ! cmp -s "$CHECK_DIR/before-worktree.patch" "$CHECK_DIR/after-worktree.patch" || \
   ! cmp -s "$CHECK_DIR/before-index.patch" "$CHECK_DIR/after-index.patch"; then
  echo
  echo "Tailwind changed files during the pre-push check. Review and commit the canonicalised changes before pushing."
  echo
  echo "Changed files:"
  {
    git diff --name-only
    git diff --cached --name-only
  } | sort -u | sed 's/^/  - /'
  exit 1
fi

echo "Tailwind canonical class check passed."
