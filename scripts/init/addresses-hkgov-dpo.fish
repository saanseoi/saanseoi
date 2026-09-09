#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:addresses:saanseoi" $argv

set -l continue_args
if test "$saanseoi_init_continue" -eq 1
    set continue_args --continue
end

set -l initialisation_status (SAANSEOI_INIT_COMMAND= SAANSEOI_INIT_GUIDES= ./bin/saanseoi init:addresses:saanseoi:status --target $saanseoi_init_target)
if test "$initialisation_status" = complete
    echo "Official address initialisation is already complete; no work required."
    exit 0
end

init_run_step ./bin/saanseoi init:addresses:saanseoi:begin --target $saanseoi_init_target $continue_args

init_run_step bun run --silent dataops -- hkgov-dpo:ingest \
    "$saanseoi_init_repo/data/hkgov/dpo/ALS" \
    --target $saanseoi_init_target --cohort-key 2024-07-25.0 \
    --defer-api-release-set --continue $saanseoi_init_curation_args
init_run_step ./bin/saanseoi release-sets:reconcile \
    --target $saanseoi_init_target --api-family addresses --region hk
init_publish_docs
init_run_step ./bin/saanseoi init:addresses:saanseoi:complete --target $saanseoi_init_target
