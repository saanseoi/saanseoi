# Analytics Studio examples

These examples are for inspecting SaanSeoi usage in Cloudflare Workers Analytics Engine.
Run the SQL examples in Analytics Studio, or send the same SQL to the Analytics Engine
SQL API.

The examples use the production dataset. Replace the dataset name when inspecting
another environment:

| Environment | Product-usage dataset         |
| ----------- | ----------------------------- |
| Local       | `ss-product-usage-local`      |
| Preview     | `ss-product-usage-preview`    |
| Production  | `ss-product-usage-production` |

The Analytics Engine SQL API uses the account read token. Keep the token in an
environment variable; do not put it in a query, commit it, or paste it into a shared
document.

```sh
export CLOUDFLARE_ACCOUNT_ID='a6eeace4b6d9f8e07ab307964e74d801'
export ANALYTICS_ENGINE_READ_TOKEN='replace-with-the-account-analytics-read-token'
export PRODUCT_USAGE_DATASET='ss-product-usage-production'
```

## Send example events

The client fallback endpoint accepts one allow-listed event per request. It is available
after the Atlas App deployment containing
`apps/atlas-app/src/routes/api/analytics/+server.ts`.

```sh
curl --request POST 'https://saanseoi.hk/api/analytics' \
  --header 'content-type: application/json' \
  --data '{
    "event": "client.release_tab_view",
    "surface": "api_release",
    "route": "/apis/divisions/1.0.0",
    "entityType": "tab",
    "entityId": "overview",
    "outcome": "success"
  }'
```

A successful request returns `204 No Content`. The endpoint returns `400` for an invalid
event or payload. Analytics is fail-open: a write failure must not affect the user
interaction.

Representative valid payloads for the tracked client and guide event families are:

```json
{"event":"client.copy_request","surface":"api_release","route":"/apis/divisions/1.0.0","entityType":"action","entityId":"copy","outcome":"success"}
{"event":"client.download_click","surface":"source_release","route":"/sources/example/1.0.0","entityType":"source_release","entityId":"example-1.0.0","outcome":"success"}
{"event":"client.source_search","surface":"sources","route":"/sources","entityType":"action","entityId":"search","outcome":"success"}
{"event":"client.basemap_control","surface":"basemaps","route":"/themes","entityType":"region","entityId":"hk","outcome":"success"}
{"event":"api_key.reveal","surface":"api_keys","route":"/api-keys","entityType":"key_action","entityId":"reveal","outcome":"success"}
{"event":"guide.milestone","surface":"guide","route":"/guides/create-a-map","entityType":"guide","entityId":"start","outcome":"success"}
```

Do not send API keys, access tokens, email addresses, copied request text, or arbitrary
query strings in these payloads.

## Hit the divisions API

This is the first-party, keyless convenience path used by SaanSeoi. Include the site
origin so the API recognises it as a first-party request:

```sh
curl --include \
  --header 'Origin: https://saanseoi.hk' \
  'https://api.saanseoi.hk/divisions/v0.1?locale=en-HK&limit=1'
```

This can produce an `api.request` product event. It does not produce an `API_USAGE`
billing event because that dataset is reserved for public API-key requests. To test
API-key usage, use a real non-secret test key without printing it in shell history or
logs:

```sh
curl --include \
  --header "X-API-Key: ${SAANSEOI_PUBLIC_API_KEY}" \
  'https://api.saanseoi.hk/divisions/v0.1?locale=en-HK&limit=1'
```

## Query the product-usage dataset

Analytics Engine uses one event index and ordered blobs. The product event layout is:

| Field     | Value                                    |
| --------- | ---------------------------------------- |
| `index1`  | Event name                               |
| `blob1`   | Schema version                           |
| `blob2`   | Event name                               |
| `blob3`   | Producer                                 |
| `blob4`   | Surface                                  |
| `blob5`   | Normalised route                         |
| `blob6`   | Entity type or access scope              |
| `blob7`   | Entity ID                                |
| `blob8`   | Optional second entity ID                |
| `blob9`   | Outcome                                  |
| `blob10`  | HTTP status                              |
| `blob11`  | Access metric key, only for `api.access` |
| `double1` | Duration in milliseconds, when supplied  |
| `double2` | Count, normally `1`                      |

### Check that recent events arrived

```sql
SELECT
  timestamp,
  index1 AS event_index,
  blob2 AS event,
  blob3 AS producer,
  blob4 AS surface,
  blob5 AS route,
  blob6 AS entity_type,
  blob7 AS entity_id,
  blob9 AS outcome,
  blob10 AS http_status,
  blob11 AS metric_key,
  double1 AS duration_ms,
  double2 AS count
FROM "ss-product-usage-production"
WHERE timestamp > NOW() - INTERVAL '1' DAY
ORDER BY timestamp DESC
LIMIT 100
```

### Count API request outcomes by route

```sql
SELECT
  blob5 AS route,
  blob9 AS outcome,
  blob10 AS http_status,
  SUM(_sample_interval * double2) AS requests
FROM "ss-product-usage-production"
WHERE index1 = 'api.request'
  AND blob3 = 'atlas-api'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY route, outcome, http_status
ORDER BY requests DESC
LIMIT 100
```

### Count client and guide events by event type

```sql
SELECT
  blob2 AS event,
  blob4 AS surface,
  blob9 AS outcome,
  SUM(_sample_interval * double2) AS events
FROM "ss-product-usage-production"
WHERE (index1 LIKE 'client.%' OR index1 LIKE 'guide.%')
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event, surface, outcome
ORDER BY events DESC
LIMIT 100
```

### Inspect attributed API access metrics

Successful API access and completed downloads are recorded as `api.access`. `blob11`
distinguishes `apiRequests.direct`, `apiRequests.via_api_release_set`,
`downloads.direct`, and `downloads.via_api_release_set`.

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  blob6 AS scope,
  blob7 AS entity_id,
  blob11 AS metric_key,
  SUM(_sample_interval * double2) AS metric_value
FROM "ss-product-usage-production"
WHERE index1 = 'api.access'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY day, scope, entity_id, metric_key
HAVING metric_value > 0
ORDER BY day DESC, metric_value DESC
LIMIT 200
```

## Check the daily rollup input

The scheduled rollup reprocesses two complete UTC days, with a 15-minute ingestion
delay. This query mirrors its Analytics Engine input and should show non-zero rows after
successful attributed API requests or completed downloads:

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  blob6 AS scope,
  blob7 AS entity_id,
  blob11 AS metric_key,
  SUM(_sample_interval * double2) AS metric_value
FROM "ss-product-usage-production"
WHERE index1 = 'api.access'
  AND timestamp >= NOW() - INTERVAL '3' DAY
GROUP BY day, scope, entity_id, metric_key
HAVING metric_value > 0
ORDER BY day DESC, scope, entity_id, metric_key
```

The rollup writes canonical daily rows and an all-time cache to the production meta D1
database. Inspect those rows with Wrangler:

```sh
bunx wrangler d1 execute ss-meta-db-prod \
  --remote \
  --config apps/atlas-api/wrangler.jsonc \
  --env production \
  --command "SELECT day, scope, entityId, metrics, updatedAt FROM accessAnalyticsDaily ORDER BY day DESC, scope, entityId LIMIT 100"
```

```sh
bunx wrangler d1 execute ss-meta-db-prod \
  --remote \
  --config apps/atlas-api/wrangler.jsonc \
  --env production \
  --command "SELECT period, scope, entityId, metrics, asOf, updatedAt FROM accessAnalyticsRollups WHERE period = 'all_time' ORDER BY scope, entityId LIMIT 100"
```

An empty D1 result with non-empty Analytics Engine input usually means the daily cron
has not run, the production Worker is missing `PRODUCT_USAGE` or
`PRODUCT_USAGE_DATASET`, or the query is within the ingestion delay window.

## Query API-key usage

`API_USAGE` contains key-authenticated request counts, keyed by the public API key ID.
It is separate from product usage and from the access-attribution rollup.

```sql
SELECT
  index1 AS api_key_id,
  toStartOfMinute(timestamp) AS minute,
  SUM(_sample_interval * double1) AS requests
FROM "ss-api-usage-production"
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY api_key_id, minute
ORDER BY minute DESC, requests DESC
LIMIT 200
```

To list the datasets available to the token:

```sh
curl --request POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql" \
  --header "Authorization: Bearer ${ANALYTICS_ENGINE_READ_TOKEN}" \
  --header 'content-type: text/plain' \
  --data 'SHOW TABLES'
```

To run an arbitrary query through the same API:

```sh
curl --request POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql" \
  --header "Authorization: Bearer ${ANALYTICS_ENGINE_READ_TOKEN}" \
  --header 'content-type: text/plain' \
  --data "SELECT index1, count() FROM ${PRODUCT_USAGE_DATASET} GROUP BY index1 ORDER BY count() DESC"
```
