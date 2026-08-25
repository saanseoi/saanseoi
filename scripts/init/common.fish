set -g saanseoi_init_script_dir (command dirname (status filename))
set -g saanseoi_init_repo (command realpath "$saanseoi_init_script_dir/../..")

builtin cd "$saanseoi_init_repo"; or exit 1

function init_run_step
    $argv
    or exit $status
end

set -g saanseoi_init_continue 0
set -g saanseoi_init_cache_artefacts 0
set -g saanseoi_init_target local
set -g saanseoi_init_last_upload_processed 0
set -g saanseoi_init_completed_release_codes
set -g saanseoi_init_docs_pending 0
set -g saanseoi_init_upload_failures 0

function init_configure
    set -l usage $argv[1]
    set -e argv[1]

    while test (count $argv) -gt 0
        switch $argv[1]
            case --continue
                set -g saanseoi_init_continue 1
                set -e argv[1]
            case --cache-artefacts --cacheArtefacts
                set -g saanseoi_init_cache_artefacts 1
                set -e argv[1]
            case --target
                if test (count $argv) -lt 2
                    echo "Usage: $usage [--target local|preview|production] [--continue] [--cacheArtefacts]" >&2
                    exit 1
                end
                switch $argv[2]
                    case local preview production
                        set -g saanseoi_init_target $argv[2]
                    case '*'
                        echo "Unsupported initialisation target: $argv[2]. Use local, preview, or production." >&2
                        exit 1
                end
                set -e argv[1..2]
            case '*'
                echo "Usage: $usage [--target local|preview|production] [--continue] [--cacheArtefacts]" >&2
                exit 1
        end
    end

    if test "$saanseoi_init_continue" -eq 1
        if test "$saanseoi_init_target" != local
            # A failed remote SQL replay may leave the persistent cache
            # invalidated after the release itself has already published.
            # Rebuild that cache before using release status to skip work.
            set -l cache_dir "$saanseoi_init_repo/.local/harbour-sql/db-cache/$saanseoi_init_target"
            if test -f "$cache_dir/invalidated.json"; or not test -f "$cache_dir/manifest.json"
                set -l cache_profile_args
                if set -q saanseoi_init_cache_table_profile
                    set cache_profile_args --table-profile $saanseoi_init_cache_table_profile
                end
                if set -q saanseoi_init_cache_cohort_key
                    set cache_profile_args $cache_profile_args --cohort-key $saanseoi_init_cache_cohort_key
                end
                init_run_step ./bin/saanseoi cache:rebuild --target $saanseoi_init_target $cache_profile_args
            end
        end
        init_load_completed_release_codes
        or begin
            echo "Cannot continue initialisation: could not read completed releases." >&2
            exit 1
        end
    end
end

function init_load_completed_release_codes
    if test "$saanseoi_init_target" != local
        set -l cache_profile_args
        if set -q saanseoi_init_cache_table_profile
            set cache_profile_args --table-profile $saanseoi_init_cache_table_profile
        end
        set -l output (./bin/saanseoi cache:completed-releases \
            --target $saanseoi_init_target $cache_profile_args 2>&1)
        set -l command_status $status
        if test $command_status -ne 0
            string join \n -- $output >&2
            return 1
        end
        set -g saanseoi_init_completed_release_codes $output
        return 0
    end

    set -l database_name ss-meta-db-preview
    set -l wrangler_args \
        --config "$saanseoi_init_repo/apps/harbour-api/wrangler.jsonc" \
        --env preview --local --persist-to "$saanseoi_init_repo/.local/d1/dev" --json

    if test "$saanseoi_init_target" = production
        set database_name ss-meta-db-prod
        set wrangler_args \
            --config "$saanseoi_init_repo/apps/harbour-api/wrangler.jsonc" \
            --env production --remote --json
    else if test "$saanseoi_init_target" = preview
        set database_name ss-meta-db-preview
        set wrangler_args \
            --config "$saanseoi_init_repo/apps/harbour-api/wrangler.jsonc" \
            --env preview --remote --json
    end

    set -l output (bun x wrangler d1 execute $database_name $wrangler_args \
        --command "SELECT code FROM releases WHERE status IN ('published', 'superseded');" 2>&1)

    if test $status -ne 0
        string join \n -- $output >&2
        return 1
    end

    set -g saanseoi_init_completed_release_codes (string join \n -- $output | jq -r '.[0].results[]?.code')
end

function init_is_completed_release
    contains -- $argv[1] $saanseoi_init_completed_release_codes
end

function init_run_upload
    set -l release_code $argv[1]
    set -e argv[1]
    set -g saanseoi_init_last_upload_processed 0

    if test "$saanseoi_init_continue" -eq 1; and init_is_completed_release "$release_code"
        echo "Skipping completed release $release_code."
        return
    end

    set -l retry_args
    if test "$saanseoi_init_continue" -eq 1
        # An interrupted upload leaves its release staged. Completed releases
        # were skipped above, so re-enter only the incomplete release without
        # permitting a published release repair.
        set retry_args --continue
    end
    set -l cache_artefact_args
    if test "$saanseoi_init_cache_artefacts" -eq 1
        set cache_artefact_args --cacheArtefacts
    end
    SAANSEOI_INIT_RELEASE_CODE=$release_code ./bin/saanseoi upload \
        --target $saanseoi_init_target $argv $retry_args $cache_artefact_args
    if test $status -ne 0
        set -g saanseoi_init_upload_failures 1
        return 1
    end
    set -g saanseoi_init_last_upload_processed 1
end

function init_publish_docs_if_processed
    if test "$argv[1]" -eq 1
        set -g saanseoi_init_docs_pending 1
    end
end

function init_publish_docs_if_needed
    if test "$saanseoi_init_docs_pending" -eq 1
        init_run_step ./bin/saanseoi docs:publish --target $saanseoi_init_target --scope all
    end
end

function init_domain_has_pending_releases
    set -l domain $argv[1]
    set -e argv[1]

    if test "$saanseoi_init_continue" -ne 1
        return 0
    end

    for year in $argv
        for type_slug in division division-area
            if not init_is_completed_release "dr-hk-hkgov-pland-$type_slug-$domain-$year"
                return 0
            end
        end
    end

    return 1
end

function init_complete
    if test "$saanseoi_init_upload_failures" -ne 0
        exit 1
    end
end
