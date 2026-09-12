<script lang="ts">
import { createVirtualizer } from '@tanstack/svelte-virtual'
import { untrack, type Snippet } from 'svelte'
import type { Json } from '@repo/core/provenance'
import ScrollArea from './auditScrollArea.svelte'

let { items, children: renderItem }: { items: Json[]; children: Snippet<[Json]> } =
  $props()
let viewport = $state<HTMLDivElement>()
const virtualizer = createVirtualizer<HTMLDivElement, HTMLLIElement>({
  count: 0,
  getScrollElement: () => viewport ?? null,
  estimateSize: () => 320,
  overscan: 3,
})

$effect(() => {
  const currentItems = items
  const element = viewport
  untrack(() => {
    $virtualizer.setOptions({
      count: currentItems.length,
      getScrollElement: () => element ?? null,
    })
    $virtualizer.measure()
    element?.scrollTo({ top: 0 })
  })
})

function measure(element: HTMLLIElement) {
  $virtualizer.measureElement(element)
  return { destroy: () => $virtualizer.measureElement(null) }
}
</script>

<ScrollArea
  bind:element={viewport}
  dataAuditVirtualList
  viewportClass="h-[640px] max-h-[70svh] overflow-auto"
>
  {#snippet children()}
    <ul
      class="relative m-0 list-none p-0"
      style:height={`${$virtualizer.getTotalSize()}px`}
    >
      {#each $virtualizer.getVirtualItems() as row (row.key)}
        <li
          use:measure
          data-index={row.index}
          aria-posinset={row.index + 1}
          aria-setsize={items.length}
          class="absolute top-0 left-0 w-full border-l border-current/15 pb-3 pl-3"
          style:transform={`translateY(${row.start}px)`}
        >
          {@render renderItem(items[row.index])}
        </li>
      {/each}
    </ul>
  {/snippet}
</ScrollArea>
