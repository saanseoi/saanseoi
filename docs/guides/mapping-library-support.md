# Mapping-library support policy

SaanSeoi’s short integration guides support browser mapping libraries with at least 5%
of the measured ecosystem, plus libraries needed to provide a correct compatibility
bridge.

## Measurement

Review the policy quarterly using the npm downloads API for the previous 90 days. Count
the official browser package for each candidate library, then divide its downloads by
the total downloads for the candidate set. Record the package names, retrieval date, raw
counts, and calculation in the pull request that changes supported libraries.

This is a reproducible adoption proxy, not a claim about all web-map usage: libraries
can be loaded from a CDN or embedded through another product. Google Maps is reviewed
separately because many applications load its JavaScript API directly rather than
through an npm package.

## 2026-08-16 baseline

The latest complete npm month available at review time was 2026-07-11 through
2026-08-09. The candidate total was 85,216,412 downloads.

| Library         | Package                     |  Downloads | Share |
| --------------- | --------------------------- | ---------: | ----: |
| Leaflet         | `leaflet`                   | 25,791,661 | 30.3% |
| Google Maps     | `@googlemaps/js-api-loader` | 21,847,194 | 25.6% |
| MapLibre GL JS  | `maplibre-gl`               | 15,570,990 | 18.3% |
| Mapbox GL JS    | `mapbox-gl`                 | 15,543,945 | 18.2% |
| OpenLayers      | `ol`                        |  3,114,104 |  3.7% |
| ArcGIS Maps SDK | `@arcgis/core`              |  1,236,990 |  1.5% |
| CesiumJS        | `cesium`                    |  1,059,161 |  1.2% |
| deck.gl         | `deck.gl`                   |  1,052,367 |  1.2% |

The first four meet the 5% threshold. The short guides deliberately provide examples
only for MapLibre GL JS, Mapbox GL JS, Leaflet, and—where GeoJSON data is relevant—the
Google Maps JavaScript API.

## Current guide coverage

- MapLibre GL JS and Mapbox GL JS: native SaanSeoi vector basemap and MapLibre-style
  support.
- Leaflet: vector basemaps and styles through the MapLibre GL Leaflet bridge; API data
  through native GeoJSON support.
- Google Maps JavaScript API: API-data support through the Data layer’s GeoJSON support.
  It does not accept external vector TileJSON or MapLibre style JSON, so it is not
  presented as a basemap or theme integration.

No guide should imply compatibility where a renderer cannot faithfully consume the
SaanSeoi format. Add an adapter only when it is maintained, documented, and tested.
