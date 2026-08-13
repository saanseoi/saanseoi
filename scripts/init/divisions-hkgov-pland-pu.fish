#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
set -g saanseoi_init_cache_table_profile divisionGeometry
init_configure "saanseoi init:divisions:hkgov-pland-pu" $argv

set -l continue_args
if test "$saanseoi_init_continue" -eq 1
    set continue_args --continue
end

init_run_step bun run --silent dataops -- hkgov-pland:backfill --kind pu --target $saanseoi_init_target $continue_args
if init_domain_has_pending_releases pu 2001 2006 2011 2016 2021
    init_run_step ./bin/saanseoi docs:publish --target $saanseoi_init_target --scope all
end
