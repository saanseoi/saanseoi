<script lang="ts">
import type { Json } from '@repo/core/provenance'
import type { Polygon, MultiPolygon } from 'geojson'
import { bbox } from '@turf/turf'
import * as ChoroplethMap from '#lib/bits/components/choroplethMap/index.js'
let { geometry, title }: { geometry: Json; title: string } = $props()
let shape = $derived(geometry as unknown as Polygon | MultiPolygon)
let bounds = $derived.by(() => {
  const [w, s, e, n] = bbox(shape)
  return [
    [w!, s!],
    [e!, n!],
  ] as [[number, number], [number, number]]
})
</script>
<ChoroplethMap.Root
  compact
  ariaLabel={`${title} — retained boundary`}
  features={[{ id: 'curation', label: title, geometry: shape }]}
  values={[{ id: 'curation', value: 1 }]}
  {bounds}
  paddingRatio={0.15}
  showValues={false}
  maxZoom={18}
/>
