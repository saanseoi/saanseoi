# Streets API family

The Streets family models persistent logical streets rather than Government Notice rows.
The LandsD gazetted register is the baseline materialisation. Each later LandsD notice
is an append-only source event that may create a next version of one logical street,
delete it, restore it, or make no materialised change.

Canonical streets have a positive, monotonic `version`, an `active` or `deleted` status,
and a nullable `deletedAt`. Deleted streets stay in the current snapshot for
auditability. A source-page snapshot alone never increments every street version.
Version changes are limited to changes in the materialised names, descriptions, district
IDs, status, relevant evidence, or translation provenance.

`GET /v0/hk/streets/{id}` returns the latest materialised state. Per-street history is
available without introducing broad street search endpoints:

- `GET /v0/hk/streets/{id}/versions`
- `GET /v0/hk/streets/{id}/versions/{version}`

Responses contain English, Traditional Chinese, and Simplified Chinese names and
descriptions, lifecycle status, publication/effective provenance, and role-tagged
`assetLinks`. Each link contains the original publisher URL and the managed asset URL.
There are no separate Government Notice or Gazette Plan URL fields. JSON:API links
provide `self`, `versions`, and the exact `version`; exact historic versions also
provide adjacent `previous` and `next` links.

Street-name change relations are separate from streets so a complete replacement, split,
or merge is not forced into a street identity. They link old and new persistent streets
by role when a reviewed change can be mapped deterministically. The notice itself
remains the evidence source through its `assetLinks`.

Each release records notice-event counts by type; streets added, changed, deleted, and
restored; active/deleted totals; versions created; description completeness; PDF
extraction outcomes; district coverage; and translation provenance. Pairing, parsing,
district, asset, lifecycle-resolution, and translation failures block publication and
are reported to the operator.
