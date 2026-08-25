<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'

type Props = {
  description?: string
  title?: string
}

let {
  description = m.guide_renderer_maplibre_blank_preview_description(),
  title = m.guide_renderer_maplibre_blank_preview_title(),
}: Props = $props()
</script>

<div
  class="relative h-full min-h-52 overflow-hidden border border-[#e7d7bf] bg-[#fff9ed] shadow-inner"
>
  <GuideMappingPreview
    ariaLabel={m.guide_renderer_maplibre_blank_preview_label()}
    center={[114.1694, 22.3193]}
    renderer="maplibre"
    unstyled
    zoom={11}
  />
  <div
    class="pointer-events-none absolute bottom-3 left-3 w-[60%] rounded-sm border border-[#bcae99] bg-[#fff9ed]/92 px-3 py-2 font-body text-body-sm text-[#3d392f] shadow-sm"
  >
    <span class="font-semibold">{title}</span>
    <span class="ml-2 text-[#6d6457]">{description}</span>
  </div>
</div>
