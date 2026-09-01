<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'

import GuideMappingPreview from './guideMappingPreview.svelte'

type Renderer = 'leaflet' | 'mapbox' | 'maplibre'

type Props = {
  description?: string
  renderer?: Renderer
  openingPosition?: CreateAMapOpeningPosition
  title?: string
  unstyled?: boolean
}

let {
  description,
  renderer = 'maplibre',
  openingPosition = { center: [114.1694, 22.3193], zoom: 11.5 },
  title,
  unstyled: unstyledOverride,
}: Props = $props()

const libraryName = (value: Renderer) =>
  value === 'mapbox' ? 'Mapbox GL JS' : value === 'leaflet' ? 'Leaflet' : 'MapLibre'
const mapboxPreviewAccessToken =
  'pk.eyJ1IjoidGlqcHRqaWsiLCJhIjoiY2ppcGt4ZXVxMHkzdzNwbzdhNXZ1dmNuZCJ9.cqrhylStTkcehygootZk9A'
const unstyled = $derived(unstyledOverride ?? renderer === 'maplibre')
const previewTitle = $derived(
  title ??
    (renderer === 'mapbox'
      ? m.guide_renderer_mapbox_preview_title()
      : renderer === 'leaflet'
        ? m.guide_renderer_leaflet_preview_title()
        : m.guide_renderer_blank_preview_title()),
)
const previewDescription = $derived(
  description ??
    (renderer === 'mapbox'
      ? m.guide_renderer_mapbox_preview_description()
      : renderer === 'leaflet'
        ? m.guide_renderer_leaflet_preview_description()
        : m.guide_renderer_blank_preview_description()),
)
const previewLabel = $derived(
  renderer === 'mapbox'
    ? m.guide_renderer_mapbox_preview_label()
    : renderer === 'leaflet'
      ? m.guide_renderer_leaflet_preview_label()
      : m.guide_renderer_blank_preview_label({ library: libraryName(renderer) }),
)
</script>

<div
  class="relative isolate h-full min-h-52 overflow-hidden border border-[#e7d7bf] bg-[#fff9ed] shadow-inner"
>
  {#key `${renderer}:${unstyled}:${openingPosition.center.join(',')}:${openingPosition.zoom}`}
    <GuideMappingPreview
      accessToken={renderer === 'mapbox' ? mapboxPreviewAccessToken : undefined}
      ariaLabel={previewLabel}
      center={openingPosition.center}
      leafletAttribution={renderer === 'leaflet' && !unstyled
        ? '© OpenStreetMap contributors'
        : undefined}
      leafletTileUrl={renderer === 'leaflet' && !unstyled
        ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        : undefined}
      mapboxStyleUrl={renderer === 'mapbox' && !unstyled
        ? 'mapbox://styles/mapbox/standard'
        : undefined}
      {renderer}
      {unstyled}
      zoom={openingPosition.zoom}
    />
  {/key}
  <div
    class="pointer-events-none absolute bottom-3 left-1/2 z-10 w-[60%] -translate-x-1/2 rounded-sm border border-[#bcae99] bg-[#fff9ed]/92 px-3 py-2 text-center font-body text-body-sm text-[#3d392f] shadow-sm"
  >
    <span class="block font-semibold">{previewTitle}</span>
    <span class="mt-0.5 block text-[#6d6457]">{previewDescription}</span>
  </div>
</div>
