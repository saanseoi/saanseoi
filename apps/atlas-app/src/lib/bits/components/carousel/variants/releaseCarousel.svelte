<script lang="ts">
import CarouselRoot from '../carouselRoot.svelte'
import { Release as CardRelease } from '$lib/bits/components/card'
type Release = {
  apiFamily: string
  code: string
  status: string
  displayStatus?: string
  schemaVersion: string
}
type Item = {
  release: Release
  displayDate: string
  displayCode: string
  records: string | null
}
type NavigationState = { canMoveBackward: boolean; canMoveForward: boolean }
type DragState = { cardId: string | null }
type Props = {
  items: Item[]
  onnavigationchange?: (state: NavigationState) => void
}
let { items, onnavigationchange }: Props = $props()
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
  ondragstatechange={(state: DragState) => (draggedCardId = state.cardId)}
  ><div class="flex min-w-max gap-4">
    {#each items as item, index (item.release.code)}
      <CardRelease {...item} {index} isDragging={draggedCardId === item.release.code} />
    {/each}
  </div></CarouselRoot
>
