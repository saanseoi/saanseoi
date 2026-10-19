# Government geocoding baseline

Run direct government providers independently of Hype and SaanSeoi:

```fish
bun scripts/geocoding/compare-government.ts --mode forward --output /tmp/government-forward.json
# Set HK_MAP_SERVICE_KEY in your local environment before reverse or combined runs.
bun scripts/geocoding/compare-government.ts --output /tmp/government-all.json
bun test scripts/geocoding/government.test.ts
```

`--mode` accepts `all` (default), `forward` or `reverse`. `--fixture` accepts a JSON
file with a `places` array containing `id`, `coordinates` in longitude/latitude order,
`googleAddress` and `addressCore`. The default is the unchanged 25-place florist
fixture. The runner records the fixture SHA-256, timestamp, exact inputs, sanitised
request URLs, HTTP status, provider payloads, elapsed time and outcomes. It checkpoints
after every request. Use distinct output paths to retain each run; an existing output is
overwritten.

ALS receives the original strings with `t=60`, `n=1`, `3d=0`. HK Map Service receives
Web Mercator coordinates and a 500-metre radius. Reverse results are never enriched by
ALS. The key is supplied through `HK_MAP_SERVICE_KEY`, never copied from Hype or stored
in the result. Requests have a 30-second timeout, 500 ms pacing and no retries, so the
record preserves first-attempt availability. HTTP or provider errors are separate from
empty ALS suggestions. A reverse error response remains an error, including provider
responses that do not distinguish absence of a match from other failures.

For future improvement reports, run the identical fixture through SaanSeoi and these
providers. Record the SaanSeoi release and both run timestamps. Manually review address
agreement independently of HTTP success and coordinate distance. Report first-result
agreement for complete strings, simplified strings and reverse pins separately, with
strict and suffix-ignoring scores. Do not treat a matching street address as proof of a
specific facility where several facilities share it. Report ambiguity and top-five
agreement separately: these baseline endpoints are configured to return one result.
Calculate distances using each provider's own returned geometry, converting HK Map
Service EPSG:3857 geometry to WGS84; do not use the query pin or Hype's enriched
geometry. Live government data has no pinned release here, and local versus
public-network latencies are not directly comparable. Include a fresh holdout sample
before making claims beyond the florist regression set.

Historical comparisons and manual scoring are in
[the comparison report](../../docs/benchmarks/geocoder-hype-2026-10-19.md).
`compare-hype.ts` separately reproduces Hype's application behaviour; it is not the
direct government baseline. `government.ts` exposes reusable request builders and a
request function for other benchmark fixtures without importing either application.

## Retained development assets

- `government.ts`, its tests and `compare-government.ts` are the reusable direct
  provider baseline. They do not import Hype.
- `fixtures/florists-2026-10-18.json` is a fixed regression fixture, also used by the
  address-parser tests. Keep it unchanged when comparing successive runs; add separate
  fixtures for holdout samples.
- `coverage.py` is a reusable, read-only footprint/address coverage audit. Its inputs
  and dependencies are documented in the dated coverage report.
- `compare-hype.ts` is a historical application comparison tool. It requires a Hype
  checkout and records source hashes because application behaviour can change. Use the
  direct government runner for provider improvement claims.
- The dated reports, raw responses, manual reviews and coverage output under
  `docs/benchmarks/` are retained evidence, not runtime inputs or automatically
  generated expectations. Preserve their original run metadata and scoring caveats.

Temporary serving databases, isolated Worker configuration, OSM extracts and exported
footprints are one-off execution material and are not repository assets. Recreate them
from pinned releases when repeating a coverage investigation.
