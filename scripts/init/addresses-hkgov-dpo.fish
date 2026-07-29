#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:addresses:default" $argv

init_run_step bun run --silent dataops -- hkgov-dpo:backfill-local \
    "$saanseoi_init_repo/data/hkgov/dpo/ALS" \
    --target local --cohort-key 2025-12-17.0
init_run_step ./bin/saanseoi docs:publish --target local --scope all
