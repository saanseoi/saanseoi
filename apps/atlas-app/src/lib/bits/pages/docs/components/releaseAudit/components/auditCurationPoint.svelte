<script lang="ts">
import * as ChoroplethMap from '#lib/bits/components/choroplethMap/index.js'
let { point, title }: { point: [number, number]; title: string } = $props()
let bounds = $derived<[[number, number], [number, number]]>([
  [point[0] - 0.006, point[1] - 0.004],
  [point[0] + 0.006, point[1] + 0.004],
])
</script>

<div class="absolute inset-0 overflow-hidden rounded-lg border border-current/15">
  <ChoroplethMap.Root
    compact
    stretch
    midnight
    zoomOffset={-2}
    ariaLabel={`${title} — representative point`}
    features={[]}
    values={[]}
    {point}
    {bounds}
    showValues={false}
    maxZoom={18}
  />
</div>
