#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:streets:hkgov-landsd" $argv

init_run_step bun run --silent dataops -- hkgov-landsd-streets:current --target $saanseoi_init_target

# Historical notice curation remains later release-revision work. It does not
# block publication of the current gazetted street-name register.
