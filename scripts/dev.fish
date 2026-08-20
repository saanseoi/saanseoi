#!/usr/bin/env fish

set -l mode all
if test (count $argv) -gt 0
    set mode $argv[1]
end

set -l filters
switch $mode
    case all
        set filters harbour-api atlas-api atlas-app basemap-viewer
    case atlas
        set filters atlas-api atlas-app
    case harbour
        set filters harbour-api
    case '*'
        echo "Unknown development mode: $mode" >&2
        echo "Usage: "(status filename)" [all|atlas|harbour]" >&2
        exit 64
end

set -l turbo_filters
for filter in $filters
    set -a turbo_filters "--filter=$filter"
end

exec bun x turbo run dev $turbo_filters
