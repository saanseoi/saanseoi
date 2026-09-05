#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:streets:hkgov-landsd" $argv

init_run_step bun run --silent dataops -- hkgov-landsd-streets:baseline --target $saanseoi_init_target

# Historical notice curation and snapshot assembly remain explicit follow-up
# work. Road Centreline also waits for the assembled street identities.
