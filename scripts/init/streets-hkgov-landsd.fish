#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:streets:hkgov-landsd" $argv

init_run_step bun run --silent dataops -- hkgov-landsd-streets:baseline --target local
init_run_step bun run --silent dataops -- hkgov-landsd-streets:landsd-notices --target local
# Deferred: this processing is intentionally excluded from the release path
# until it is ready to run independently.
init_run_step bun run --silent dataops -- hkgov-landsd-streets:assemble --target local
init_run_step ./bin/saanseoi docs:publish --target local --scope all

# Preserve the official Road Centreline archive for the dedicated release
# processor. It must run after street assembly because source segments are
# matched to the assembled LandsD street identities.
init_run_step ./bin/saanseoi update --target local \
    --dataset ds-hk-hkgov-landsd-road-centreline --check-now --yes
