function __saanseoi_bun_upload_index
    set -l words (commandline -opc)

    if test (count $words) -lt 3
        return 1
    end

    if test "$words[1]" != "bun"
        return 1
    end

    if test "$words[2]" != "run"
        return 1
    end

    set -l index 3
    while test $index -le (count $words)
        set -l token $words[$index]

        switch $token
            case '--filter' '--cwd' '--config' '--preload'
                set index (math $index + 2)
                continue
            case '--*'
                set index (math $index + 1)
                continue
            case 'upload'
                echo $index
                return 0
            case '*'
                set index (math $index + 1)
        end
    end

    return 1
end

function __saanseoi_bun_upload_active
    __saanseoi_bun_upload_index >/dev/null
end

function __saanseoi_bun_upload_previous_token
    set -l words (commandline -opc)

    if test (count $words) -gt 0
        echo $words[-1]
    end
end

function __saanseoi_bun_upload_expect_value_for
    set -l previous (__saanseoi_bun_upload_previous_token)
    contains -- "$previous" $argv
end

function __saanseoi_bun_upload_positional_count
    set -l upload_index (__saanseoi_bun_upload_index)
    or return 1

    set -l words (commandline -opc)
    set -l count 0
    set -l expects_value 0
    set -l index (math $upload_index + 1)

    while test $index -le (count $words)
        set -l token $words[$index]

        if test $expects_value -eq 1
            set expects_value 0
            set index (math $index + 1)
            continue
        end

        switch $token
            case '--type' '--theme' '--region' '--month' '--source' '--source-version' '--db' '--raw-root'
                set expects_value 1
            case '--dry-run' '--yes'
            case '--*'
            case '*'
                set count (math $count + 1)
        end

        set index (math $index + 1)
    end

    echo $count
end

function __saanseoi_bun_upload_current_token_is_option
    string match -qr '^-' -- (commandline -ct)
end

function __saanseoi_bun_upload_complete_primary_file
    __saanseoi_bun_upload_active; or return 1
    __saanseoi_bun_upload_current_token_is_option; and return 1

    set -l previous (__saanseoi_bun_upload_previous_token)
    contains -- "$previous" --type --theme --region --month; and return 1

    set -l positional_count (__saanseoi_bun_upload_positional_count)
    set -l current_token (commandline -ct)

    if test -z "$current_token"
        test "$positional_count" -eq 0
        return $status
    end

    test "$positional_count" -le 1
end

function __saanseoi_bun_upload_complete_options
    __saanseoi_bun_upload_active; or return 1

    if __saanseoi_bun_upload_current_token_is_option
        return 0
    end

    set -l current_token (commandline -ct)
    set -l positional_count (__saanseoi_bun_upload_positional_count)

    test -z "$current_token"; and test "$positional_count" -ge 1
    return $status
end

function __saanseoi_bun_upload_complete_path_option
    __saanseoi_bun_upload_expect_value_for --db --raw-root
end

function __saanseoi_bun_upload_complete_enum_option
    __saanseoi_bun_upload_expect_value_for --type --theme --region
end

function __saanseoi_bun_upload_complete_freeform_value
    __saanseoi_bun_upload_expect_value_for --month --source --source-version
end

function __saanseoi_bun_upload_suppress_other_completions
    return 0
end

complete -c bun -n '__saanseoi_bun_upload_complete_options' -l type -d 'Dataset type'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l theme -d 'Dataset theme'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l region -d 'Region code'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l month -d 'Snapshot month (YYYY-MM)'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l source -d 'Source identifier'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l source-version -d 'Source version'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l db -d 'Local SQLite path'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l raw-root -d 'Raw staging directory'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l dry-run -d 'Preview without staging or DB writes'
complete -c bun -n '__saanseoi_bun_upload_complete_options' -l yes -d 'Skip confirmation prompt'

complete -c bun -n '__saanseoi_bun_upload_expect_value_for --type' -a 'place division address'
complete -c bun -n '__saanseoi_bun_upload_expect_value_for --theme' -a 'places divisions'
complete -c bun -n '__saanseoi_bun_upload_expect_value_for --region' -a 'hk mo'
complete -c bun -n '__saanseoi_bun_upload_complete_path_option' -F
complete -c bun -n '__saanseoi_bun_upload_complete_enum_option' -f
complete -c bun -n '__saanseoi_bun_upload_complete_freeform_value' -f

complete -c bun -n '__saanseoi_bun_upload_complete_primary_file' -F -d 'Upload file'
