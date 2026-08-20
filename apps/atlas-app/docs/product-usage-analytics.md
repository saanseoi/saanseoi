# Product-usage analytics

Atlas product usage is recorded separately from API-key billing and usage accounting.
Cloudflare Web Analytics remains responsible for ordinary page and SPA navigation
measurement. The product event dataset is for understanding meaningful product
interactions and endpoint outcomes; it is not a unique-user or clickstream identity
system.

## Dataset bindings

Both workers use the same versioned `v1` contract and separate Analytics Engine datasets
per environment:

| Environment | `PRODUCT_USAGE` dataset       |
| ----------- | ----------------------------- |
| local       | `ss-product-usage-local`      |
| preview     | `ss-product-usage-preview`    |
| production  | `ss-product-usage-production` |

`MAP_GUIDE_SELECTIONS` and `API_USAGE` are retained as separate legacy/operational
datasets. Product events must never be used for API-key billing or rate accounting.

## Event shape

Each datapoint uses the following Analytics Engine fields:

| Field         | Meaning                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indexes[0]`  | allowlisted event name                                                                                                                            |
| `indexes[1]`  | allowlisted surface                                                                                                                               |
| `blobs[0..9]` | schema version, event, producer, surface, normalised route, public entity type, public entity ID, optional second public ID, outcome, HTTP status |
| `doubles[0]`  | optional duration in milliseconds, otherwise `0`                                                                                                  |
| `doubles[1]`  | optional count, otherwise `1`                                                                                                                     |

Routes have query strings removed and path parameters normalised to `:id`. Entity
identifiers are accepted only from a bounded public identifier alphabet. Event names,
producers, surfaces, entity types, and outcomes are all strict allowlists.

The contract never records email addresses, passwords, raw API keys, API-key names,
copied text, tokens, arbitrary query strings, IP addresses, user IDs, or full user-agent
values. Client-only events use the same-origin `/api/analytics` endpoint with
`keepalive`; Analytics Engine is never exposed to browser code.

## Event families

- Endpoint telemetry: first-party API requests, public source assets, style JSON,
  newsletter outcomes, Better Auth outcomes, account mutations, API-key mutations, and
  registry data loads.
- Release interactions: API release and source release archive-download clicks, tab
  views, notes diff, audit controls, request copying, evidence actions, and sample
  controls.
- Discovery and guide interactions: source search/flow expansion, basemap/theme
  controls, style and viewer links, and Create-a-Map milestones and handovers.

Registry remote-query events are named `registry.data_load` and represent endpoint/data
load telemetry. They must not be interpreted as user clicks or unique users.

The surface taxonomy is intentionally smaller than the event taxonomy. `api_release` and
`source_release` identify the two release-detail page contexts; the tab or control is
carried by the event and entity fields, so notes, stats, audit, samples, sources, and
assembly do not need separate surfaces. `sources` covers both source search and
source-flow expansion. `guide` covers Create-a-Map guide actions.

## Example Analytics Engine queries

The exact dataset name should be selected for the environment being inspected.

```sql
-- Successful first-party API requests by normalised route.
SELECT blob5 AS route, count() AS requests
FROM ss_product_usage_production
WHERE blob2 = 'api.request' AND blob3 = 'atlas-api' AND blob9 = 'success'
GROUP BY route
ORDER BY requests DESC
LIMIT 100
```

```sql
-- Archive download intent by release-detail page context.
SELECT blob4 AS surface, count() AS downloads
FROM ss_product_usage_production
WHERE blob2 = 'client.download_click' AND blob4 IN ('api_release', 'source_release')
GROUP BY surface
```

```sql
-- Registry data-load outcomes; this is not a user metric.
SELECT blob5 AS route, blob9 AS outcome, count() AS loads
FROM ss_product_usage_production
WHERE blob2 = 'registry.data_load'
GROUP BY route, outcome
```
