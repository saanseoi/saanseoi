#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init" $argv

set -l continuation_args
if test "$saanseoi_init_continue" -eq 1
    set continuation_args --continue
end

for command in \
    init:divisions:overture \
    init:divisions:hkgov-pland-pu \
    init:divisions:hkgov-pland-new-town \
    init:divisions:hkgov-landsd \
    init:streets:hkgov-landsd \
    init:addresses:default
    switch $command
        case init:divisions:overture init:divisions:hkgov-pland-pu init:divisions:hkgov-pland-new-town
            init_run_step ./bin/saanseoi $command $continuation_args
        case '*'
            init_run_step ./bin/saanseoi $command
    end
end
