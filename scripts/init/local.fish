#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:local" $argv

init_run_step bun run db:reset:local
init_clear_clean_run_manifests local

set -l cache_artefact_opt_out_args
if test "$saanseoi_init_cache_artefacts" -ne 1
    set cache_artefact_opt_out_args --no-cache-artefacts
end

for command in \
    init:divisions \
    init:addresses \
    init:places \
    init:stats
    if test "$command" = init:stats
        SAANSEOI_INIT_DEFER_DOCS=1 SAANSEOI_INIT_COMPLETED_PREREQUISITES=divisions:geographic \
            init_run_step ./bin/saanseoi $command --target local $cache_artefact_opt_out_args
    else
        SAANSEOI_INIT_DEFER_DOCS=1 init_run_step ./bin/saanseoi $command --target local $cache_artefact_opt_out_args
    end
end

init_publish_docs
