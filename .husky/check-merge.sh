#!/usr/bin/env bash

current_branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$current_branch" = "main" ]; then
  if git rev-parse --verify --quiet HEAD^2 > /dev/null; then
    merge_msg=$(git log --format=%B -n 1 HEAD)

    if echo "$merge_msg" | grep -q "Merge branch"; then
      source_branch=$(echo "$merge_msg" | sed -n "s/.*Merge branch '\([^']*\)'.*/\1/p")

      if [ "$source_branch" != "preview" ] && [ "$source_branch" != "hotfix" ]; then
        echo "Error: merges to 'main' are only allowed from 'preview' or 'hotfix'."
        echo "You tried to merge from: '$source_branch'"
        exit 1
      fi

      echo "Merge to main from '$source_branch' is allowed."
    fi
  else
    echo "Error: direct pushes to 'main' are not allowed."
    echo "Create a pull request through 'preview' or 'hotfix'."
    exit 1
  fi
fi

exit 0
