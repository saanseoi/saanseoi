<script lang="ts">
import ReleaseLinksSkeletonEntry from './releaseLinksSkeletonEntry.svelte'

type Props = { entryCount: 1 | 2; expanded?: boolean }

let { entryCount, expanded = false }: Props = $props()
</script>

<section
  class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
>
  <header
    class="flex min-h-[78px] items-end justify-between gap-4 bg-data-surface-container-lowest px-5 py-4"
  >
    <div>
      <div
        class="h-3 w-32 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
      ></div>
      <div
        class="mt-2 h-6 w-52 rounded-md bg-data-surface-container-high motion-safe:animate-pulse"
      ></div>
    </div>
    <div
      class="h-4 w-5 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
    ></div>
  </header>

  <div class="border-t border-data-outline-variant/60 bg-data-surface-container-low">
    <div class="relative grid gap-6 p-5 pl-12">
      {#each Array(entryCount) as _, index}
        <div class="relative">
          {#if index === 0}
            <span
              class="absolute -top-5 -left-6 h-16.5 border-l border-data-outline-variant/70"
              aria-hidden="true"
            ></span>
          {/if}
          {#if index < entryCount - 1}
            <span
              class="absolute top-11.5 -bottom-17.5 -left-6 border-l border-data-outline-variant/70"
              aria-hidden="true"
            ></span>
          {/if}
          <span
            class="absolute top-11.5 -left-6 z-0 h-px w-6 bg-data-outline-variant/70"
            aria-hidden="true"
          ></span>
          <span
            class="absolute top-10.5 left-[-1.65rem] z-10 size-2 rounded-full bg-data-primary/70 ring-4 ring-data-surface-container-low"
            aria-hidden="true"
          ></span>
          <ReleaseLinksSkeletonEntry {expanded} compact={!expanded} />
        </div>
      {/each}
    </div>
  </div>
</section>
