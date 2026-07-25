# Streets API family

The Streets API family contains named street records and their source provenance. The
LandsD gazetted street-name source is a government register rather than road-centreline
geometry: its initial release is a full name list and subsequent releases are immutable
Government Notice records. Geometry from another source can later be attached as a
separate projection without changing this evidence model.

The LandsD source is registered as
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).
Its snapshots preserve English, Traditional Chinese, and Azure-derived Simplified
Chinese names; LandsD publication date and notice type; raw district text; resolved
canonical `districtIds`; and structured, role-tagged asset links that retain both the
original source URL and managed public asset URL.

`GET /v0/hk/streets/{id}` is intentionally the first public surface. It returns the
three names, LandsD notice fields, and role-tagged asset links with both original
Government Notice/Gazette Plan URLs and managed public asset URLs. It never exposes
private R2 object keys. Broad street search and list endpoints are outside this initial
scope.

Each release records operational quality statistics for the release stats tab: locale
completeness, district distribution, notice-type counts, source-asset roles, translation
provenance, churn, and district-normalisation status. Bilingual pairing, asset,
district, and translation failures are blocking conditions rather than degraded data.
