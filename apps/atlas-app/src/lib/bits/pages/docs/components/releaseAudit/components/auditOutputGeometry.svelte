<script lang="ts">
import { getAuditGeometry } from '#lib/registry/auditGeometry.remote.js'
import * as ChoroplethMap from '#lib/bits/components/choroplethMap/index.js'
import { bbox } from '@turf/turf'
import type { Polygon, MultiPolygon } from 'geojson'
import type { Json } from '@repo/core/provenance'
let {
  releaseId,
  divisionId,
  title,
  exclusion = null,
}: { releaseId: string; divisionId: string; title: string; exclusion?: Json } = $props()
let excludedGeometry = $derived.by(() => {
  const value =
    exclusion && typeof exclusion === 'object' && !Array.isArray(exclusion)
      ? exclusion.exclusion
      : null
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.type !== 'Polygon' ||
    !Array.isArray(value.coordinates)
  )
    return null
  return value as unknown as Polygon
})
let result = $derived(getAuditGeometry({ releaseId, divisionId }))
let geometry = $derived.by(() => {
  const value = result.ready ? result.current : null
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    !('coordinates' in value) ||
    !Array.isArray(value.coordinates)
  )
    return null
  return value.type === 'Polygon' || value.type === 'MultiPolygon'
    ? (value as Polygon | MultiPolygon)
    : null
})
let bounds = $derived.by(() => {
  if (!geometry) return undefined
  const [w, s, e, n] = bbox(geometry)
  return [
    [w!, s!],
    [e!, n!],
  ] as [[number, number], [number, number]]
})
</script>

{#if geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')}
  <ChoroplethMap.Root
    compact
    exclusion={excludedGeometry}
    ariaLabel={title}
    features={[{ id: divisionId, label: title, geometry }]}
    values={[{ id: divisionId, value: 1 }]}
    {bounds}
    paddingRatio={0.1}
    showValues={false}
    maxZoom={18}
  />
{/if}
