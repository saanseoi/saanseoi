<script lang="ts">
import CarouselRoot from '../carouselRoot.svelte'
import { Release as CardRelease } from '$lib/bits/components/card'
type Release = {
  apiFamily: string
  code: string
  status: string
  schemaVersion: string
}
type Item = {
  release: Release
  displayDate: string
  displayCode: string
  records: string | null
}
type NavigationState = { canMoveBackward: boolean; canMoveForward: boolean }
type Props = {
  items: Item[]
  onnavigationchange?: (state: NavigationState) => void
}
let { items, onnavigationchange }: Props = $props()
let carousel = $state<{ scrollByPage: (direction: -1 | 1) => void }>()
export function scrollByPage(direction: -1 | 1) {
  carousel?.scrollByPage(direction)
}
</script>
<CarouselRoot bind:this={carousel} class="mt-6" {onnavigationchange}
  ><div class="flex min-w-max gap-4">
    {#each items as item, index (item.release.code)}
      <CardRelease {...item} {index} />
    {/each}
  </div></CarouselRoot
>
