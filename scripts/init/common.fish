set -g saanseoi_init_script_dir (command dirname (status filename))
set -g saanseoi_init_repo (command realpath "$saanseoi_init_script_dir/../..")

builtin cd "$saanseoi_init_repo"; or exit 1

function init_run_step
    $argv
    or exit $status
end

set -g saanseoi_init_continue 0
set -g saanseoi_init_last_upload_processed 0
set -g saanseoi_init_completed_release_codes

function init_configure
    set -l usage $argv[1]
    set -e argv[1]

    if test (count $argv) -gt 1; or test (count $argv) -eq 1; and test "$argv[1]" != "--continue"
        echo "Usage: $usage [--continue]" >&2
        exit 1
    end

    if test (count $argv) -eq 1
        set -g saanseoi_init_continue 1
        init_load_completed_release_codes
        or begin
            echo "Cannot continue initialisation: could not read completed local releases." >&2
            exit 1
        end
    end
end

function init_load_completed_release_codes
    set -l output (bun x wrangler d1 execute ss-meta-db-preview \
        --config "$saanseoi_init_repo/apps/harbour-api/wrangler.jsonc" \
        --env preview --local --persist-to "$saanseoi_init_repo/.local/d1/dev" --json \
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

    init_run_step ./bin/saanseoi upload --target local $argv
    set -g saanseoi_init_last_upload_processed 1
end

function init_publish_docs_if_processed
    if test "$argv[1]" -eq 1
        init_run_step ./bin/saanseoi docs:publish --target local --scope all
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
