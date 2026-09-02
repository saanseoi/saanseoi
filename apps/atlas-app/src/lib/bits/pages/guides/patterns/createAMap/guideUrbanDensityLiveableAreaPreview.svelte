<script lang="ts">
import GuideMappingPreview from './guideMappingPreview.svelte'
import GuideUrbanDensityLiveableLegend from './guideUrbanDensityLiveableLegend.svelte'
import { addUrbanDensityLiveableLand } from './guideUrbanDensityLiveableMap.ts'

type Props = {
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  styleUrl: string
  tilejsonUrl: string
}

let { label, renderer, styleUrl, tilejsonUrl }: Props = $props()
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${renderer}:${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      center={[114.16, 22.32]}
      onMapReady={async map => {
        await addUrbanDensityLiveableLand(map)
      }}
      {renderer}
      {styleUrl}
      {tilejsonUrl}
      zoom={10.75}
    />
  {/key}
  <GuideUrbanDensityLiveableLegend />
</div>
