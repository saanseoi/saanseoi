# Estimated lift waiting time

The optional native patch `valhalla-lift-wait.patch` adds
`costing_options.pedestrian.elevator_wait` to pedestrian `/route` requests. It is an
estimated number of seconds per boarding, bounded to 0–600 and defaulting to zero. The
Hype indoor trial explicitly requests 120 seconds to favour stairs/escalators. This is
not measured station data or a live lift queue prediction.

```json
{
  "costing": "pedestrian",
  "costing_options": {
    "pedestrian": { "elevator_wait": 30 }
  }
}
```

Waiting contributes to elapsed time and route-selection cost. The existing
`elevator_penalty` remains an independent preference penalty. Shortest-distance mode
retains its distance objective but still reports elapsed waiting time. Consecutive
elevator edges count as one ride; a corridor between elevators begins a new boarding.
Node elevators charge once when incoming/outgoing levels differ, not once per floor.
This relies on correct source connectivity and floor tags. It does not add calibrated
vertical travel speed or per-station waiting estimates.

When waiting is enabled, correlation excludes elevator edges to prevent starting inside
a lift and bypassing boarding. The pedestrian route search retains zero-length
landing-corridor endpoint seeds, allowing immediate boarding without a corridor U-turn.
Supply `search_filter.level` at indoor endpoints. Source graphs must provide connected,
floor-labelled landing corridors. This is validated for pedestrian route search, not
multimodal or matrix APIs.

`GET /status` reports `saanseoi_elevator_wait: true`; clients must check this before
relying on the new option because older engines silently ignore unknown options. No
tile-format changes are needed, and existing graph-builder provenance stays unchanged. A
new runtime binary is required. Build the optional runtime with
`--build-arg ENABLE_LIFT_WAIT=1 --target engine`. Its source identity is in
`lift-wait-engine-release.json`; the default `engine-release.json` remains unchanged.
The Dockerfile applies the separately checksummed patch after the existing upstream
#6291 backport and runs `gurka_indoor`. Do not update graph publication manifests to
pretend they were built by this runtime.

The native regressions cover edge/node lifts, multiple floors, contiguous lift segments,
transfers, same-floor passage, route selection, both travel directions, and coincident
landing coordinates. Default-zero requests retain upstream behaviour.
