<script lang="ts">
import * as ChoroplethMap from '#lib/bits/components/choroplethMap/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import { bbox } from '@turf/turf'
import type { Polygon, MultiPolygon } from 'geojson'
let { geometry }: { geometry: Polygon | MultiPolygon } = $props()
let bounds = $derived.by(() => {
  const [west, south, east, north] = bbox(geometry)
  if (
    west === undefined ||
    south === undefined ||
    east === undefined ||
    north === undefined
  ) {
    return undefined
  }
  return [
    [west, south],
    [east, north],
  ] as [[number, number], [number, number]]
})
</script>

<ChoroplethMap.Root
  ariaLabel={m.source_audit_exclusion_area()}
  features={[]}
  values={[]}
  exclusion={geometry}
  {bounds}
  paddingRatio={0.25}
  showValues={false}
  maxZoom={18}
/>
