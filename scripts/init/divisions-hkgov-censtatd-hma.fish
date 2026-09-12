#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions:hkgov-censtatd-hma" $argv

# Housing Market Areas are a multi-resource C&SD source: its Statistics
# delivery also owns the current Division and Division Area domain. Keep the
# Statistics release-set deferred so this focused Divisions run does not
# publish a partial Statistics cohort.
init_run_step ./bin/saanseoi update --target $saanseoi_init_target \
    --dataset ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups \
    --download --check-now --defer-stats-release-set --include-geography --yes
init_publish_docs
