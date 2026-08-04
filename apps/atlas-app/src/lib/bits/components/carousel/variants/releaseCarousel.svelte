<script lang="ts">
import CarouselRoot from '../carouselRoot.svelte'
import { Release as CardRelease } from '$lib/bits/components/card'
import { BasemapRelease as CardBasemapRelease } from '$lib/bits/components/card'
import type { BasemapRelease } from '$lib/registry/types'
import ReleaseCarouselSkeleton from './releaseCarouselSkeleton.svelte'
type Release = {
  apiFamily: string
  code: string
  status: string
  displayStatus?: string
  schemaVersion: string
}
type ApiItem = {
  kind: 'api'
  release: Release
  displayDate: string
  displayCode: string
  records: string | null
}
type BasemapItem = {
  kind: 'basemap'
  release: BasemapRelease
  displayDate: string
  displayCode: string
  size: string
}
type Item = ApiItem | BasemapItem
type NavigationState = { canMoveBackward: boolean; canMoveForward: boolean }
type DragState = { cardId: string | null }
type Props = {
  items: Item[]
  isLoading?: boolean
  onnavigationchange?: (state: NavigationState) => void
  onreachend?: () => void
}
let { items, isLoading = false, onnavigationchange, onreachend }: Props = $props()
let carousel = $state<{ scrollByPage: (direction: -1 | 1) => void }>()
let draggedCardId = $state<string | null>(null)
export function scrollByPage(direction: -1 | 1) {
  carousel?.scrollByPage(direction)
}
</script>
<CarouselRoot
  bind:this={carousel}
  class="mt-6"
  {onnavigationchange}
  {onreachend}
  ondragstatechange={(state: DragState) => (draggedCardId = state.cardId)}
  ><div class="flex min-w-max gap-4">
    {#each items as item, index (item.release.code)}
      {#if item.kind === 'basemap'}
        <CardBasemapRelease
          release={item.release}
          displayDate={item.displayDate}
          displayCode={item.displayCode}
          size={item.size}
          isDragging={draggedCardId === item.release.code}
        />
      {:else}
        <CardRelease
          {...item}
          {index}
          isDragging={draggedCardId === item.release.code}
        />
      {/if}
    {/each}
    {#if isLoading}
      <ReleaseCarouselSkeleton />
    {/if}
  </div></CarouselRoot
>
