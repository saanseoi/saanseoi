<script lang="ts">
import { Popover } from 'bits-ui'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
</script>
<div class="flex justify-end">
  <Popover.Root>
    <Popover.Trigger
      class="inline-flex size-7 items-center justify-center rounded-full text-foreground-alt transition hover:bg-surface-container-high hover:text-primary focus-visible:outline-2 focus-visible:outline-secondary"
      aria-label="About this manifest"
    >
      <Icon icon="proicons:info" class="size-4" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        class="z-70 max-w-80 rounded-md border border-outline-variant bg-surface-container px-4 py-3 font-body text-label-md text-primary shadow-lg"
      >
        <p>
          An OpenStreetMap basemap built with Protomaps, with regional boundaries and
          coastline geometry. Build and source details describe this specific release.
        </p>
        <p class="mt-3 border-t border-outline-variant pt-3 text-foreground-alt">
          Regional OSM PBF downloads are only offered for the latest two releases.
          PMTiles downloads remain available for every published release.
        </p>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
