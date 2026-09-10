set -g saanseoi_init_script_dir (command dirname (status filename))
set -g saanseoi_init_repo (command realpath "$saanseoi_init_script_dir/../..")

builtin cd "$saanseoi_init_repo"; or exit 1

function init_fail
    set -l command_status $argv[1]
    if set -q saanseoi_init_failure_command[1]
        set -l failure_command $saanseoi_init_failure_command
        set -e saanseoi_init_failure_command
        $failure_command
    end
    exit $command_status
end

function init_run_step
    if test "$saanseoi_init_skip_curation_checks" -eq 1; and test "$argv[1]" = ./bin/saanseoi; and string match -qr '^init(:|$)' -- $argv[2]; and not string match -qr ':(begin|complete|fail)$' -- $argv[2]
        set -a argv --skip-curation-checks
    end
    $argv
    or init_fail $status
end

# Parent initialisers may hand off a prerequisite they have already completed
# to a child process. The marker is deliberately process-scoped: a standalone
# child must still establish every prerequisite itself.
function init_has_completed_prerequisite
    set -l prerequisite $argv[1]
    contains -- "$prerequisite" (string split ',' -- "$SAANSEOI_INIT_COMPLETED_PREREQUISITES")
end

# The clean local and production coordinators reset their databases before
# starting. Their family manifests are therefore stale by definition and must
# not block the next clean run. Focused initialisers deliberately do not call
# this helper: their manifest is the ownership boundary used by reset.
function init_clear_clean_run_manifests
    set -l target $argv[1]
    if test -z "$target"
        set target $saanseoi_init_target
    end
    rm -f \
        "$saanseoi_init_repo/.local/hkgov-dpo/init-runs/$target.json" \
        "$saanseoi_init_repo/.local/overture-places/init-runs/$target.json" \
        "$saanseoi_init_repo/.local/hkgov-dpo/init-runs/$target.minimal.json" \
        "$saanseoi_init_repo/.local/overture-places/init-runs/$target.minimal.json"
end

set -g saanseoi_init_continue 0
set -g saanseoi_init_skip_curation_checks 0
set -g saanseoi_init_curation_args
set -g saanseoi_init_cache_artefacts 1
set -g saanseoi_init_target local
set -g saanseoi_init_last_upload_processed 0
set -g saanseoi_init_completed_release_codes
set -g saanseoi_init_completed_releases_loaded 0
set -g saanseoi_init_release_column_width 0
set -g saanseoi_init_docs_pending 0
set -g saanseoi_init_upload_failures 0
set -g saanseoi_init_skipped_release_codes

function init_configure
    set -l usage $argv[1]
    set -e argv[1]

    while test (count $argv) -gt 0
        switch $argv[1]
            case --skip-curation-checks
                set -g saanseoi_init_skip_curation_checks 1
                set -g saanseoi_init_curation_args --skip-curation-checks
                set -e argv[1]
            case --continue
                set -g saanseoi_init_continue 1
                set -e argv[1]
            case --no-cache-artefacts
                set -g saanseoi_init_cache_artefacts 0
                set -e argv[1]
            case --target
                if test (count $argv) -lt 2
                    echo "Usage: $usage [--target local|preview|production] [--continue] [--no-cache-artefacts] [--skip-curation-checks]" >&2
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
                echo "Usage: $usage [--target local|preview|production] [--continue] [--no-cache-artefacts] [--skip-curation-checks]" >&2
                exit 1
        end
    end
end

function init_prepare_completed_releases
    if test "$saanseoi_init_completed_releases_loaded" -ne 1
        if test "$saanseoi_init_target" != local
            # A failed remote SQL replay may leave the persistent cache
            # invalidated after the release itself has already published.
            # Rebuild that cache before using release status to skip work.
            set -l cache_dir "$saanseoi_init_repo/.local/harbour-sql/db-cache/$saanseoi_init_target"
            if test -f "$cache_dir/invalidated.json"; or not test -f "$cache_dir/manifest.json"
                if test -f "$cache_dir/invalidated.json"
                    echo "Rebuilding $saanseoi_init_target cache: invalidation marker present at $cache_dir/invalidated.json" >&2
                    jq -r '.reason // "No invalidation reason recorded"' "$cache_dir/invalidated.json" >&2
                else
                    echo "Rebuilding $saanseoi_init_target cache: manifest missing at $cache_dir/manifest.json" >&2
                end
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
            echo "Cannot initialise: could not read completed releases." >&2
            exit 1
        end
        set -g saanseoi_init_completed_releases_loaded 1
        if set -q SAANSEOI_INIT_RELEASE_COLUMN_WIDTH
            set -g saanseoi_init_release_column_width $SAANSEOI_INIT_RELEASE_COLUMN_WIDTH
            return
        end
        for release_code in $saanseoi_init_completed_release_codes
            set -l width (string length -- "$release_code")
            if test "$width" -gt "$saanseoi_init_release_column_width"
                set -g saanseoi_init_release_column_width $width
            end
        end
        set -gx SAANSEOI_INIT_RELEASE_COLUMN_WIDTH $saanseoi_init_release_column_width
    end
end

function init_load_completed_release_codes
    if test "$saanseoi_init_target" != local
        set -l cache_profile_args
        if set -q saanseoi_init_cache_table_profile
            set cache_profile_args --table-profile $saanseoi_init_cache_table_profile
        end
        set -l output (SAANSEOI_INIT_GUIDES= ./bin/saanseoi cache:completed-releases \
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
    init_prepare_completed_releases
    contains -- $argv[1] $saanseoi_init_completed_release_codes
end

function init_skip_completed_release
    set -l release_code $argv[1]
    if init_is_completed_release "$release_code"
        set -a saanseoi_init_skipped_release_codes "$release_code"
        return 0
    end
    return 1
end

function init_render_skipped_releases
    if test (count $saanseoi_init_skipped_release_codes) -eq 0
        return
    end
    set -l release_codes (string join , -- $saanseoi_init_skipped_release_codes)
    init_run_step ./bin/saanseoi init:skipped --target $saanseoi_init_target --release $release_codes
end

function init_run_upload
    set -l release_code $argv[1]
    set -e argv[1]
    set -g saanseoi_init_last_upload_processed 0

    if init_skip_completed_release "$release_code"
        return 0
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
        init_publish_docs
    end
end

function init_publish_docs
    if test "$SAANSEOI_INIT_DEFER_DOCS" = 1
        return 0
    end
    init_run_step ./bin/saanseoi docs:publish --target $saanseoi_init_target --scope all
end

function init_published_api_release_set_count
    if not set -q SAANSEOI_INIT_SUMMARY_PATH; or not test -f "$SAANSEOI_INIT_SUMMARY_PATH"
        echo 0
        return
    end

    jq -s '[.[] | select(.type == "published-api-release-set")] | length' \
        "$SAANSEOI_INIT_SUMMARY_PATH"
end

# Reconciliation can make previously draft sets current after a resumed run.
# It is only worth scanning and publishing their documentation if that actually
# occurred; otherwise a failed initialisation needlessly waits on docs:publish
# before its final error summary is rendered.
function init_reconcile_draft_release_sets
    if not set -q SAANSEOI_INIT_SUMMARY_PATH
        init_run_step $argv
        set -g saanseoi_init_docs_pending 1
        return
    end

    set -l published_before (init_published_api_release_set_count)
    init_run_step $argv
    set -l command_status $status
    if test $command_status -ne 0
        return $command_status
    end

    # The reconciliation command refreshes DB_META. Dataset mirrors are already
    # maintained by upload replay and are unchanged by release-set composition.

    set -l published_after (init_published_api_release_set_count)
    if test "$published_after" -gt "$published_before"
        set -g saanseoi_init_docs_pending 1
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
    init_render_skipped_releases
    if test "$saanseoi_init_upload_failures" -ne 0
        init_fail 1
    end
end
