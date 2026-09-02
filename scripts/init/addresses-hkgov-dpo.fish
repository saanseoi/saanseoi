#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:addresses:official" $argv

set -l continue_args
if test "$saanseoi_init_continue" -eq 1
    set continue_args --continue
end

init_run_step ./bin/saanseoi init:addresses:official:begin --target $saanseoi_init_target $continue_args

init_run_step bun run --silent dataops -- hkgov-dpo:ingest \
    "$saanseoi_init_repo/data/hkgov/dpo/ALS" \
    --target $saanseoi_init_target --cohort-key 2025-12-17.0 $continue_args
init_run_step ./bin/saanseoi docs:publish --target $saanseoi_init_target --scope all
init_run_step ./bin/saanseoi init:addresses:official:complete --target $saanseoi_init_target
