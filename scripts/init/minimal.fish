#!/usr/bin/env fish

# Additive production smoke test: never invoke the reset coordinators.
set -gx SAANSEOI_INIT_MINIMAL 1
source (command dirname (status filename))/all.fish
