<script lang="ts">
type Props = { compact?: boolean; expanded?: boolean }

let { compact = false, expanded = false }: Props = $props()
</script>

<article
  class="overflow-hidden rounded-md border border-data-outline-variant/60 bg-data-surface-container-low"
>
  {#if compact}
    <div
      class="flex h-[55px] items-center justify-between gap-6 bg-data-surface-container-lowest px-5 py-4"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="h-3 w-28 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
        ></div>
        <div
          class="h-4 w-24 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
        ></div>
      </div>
      <div class="flex items-center gap-5">
        <div
          class="h-4 w-14 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
        ></div>
        <div
          class="size-5 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
        ></div>
      </div>
    </div>
  {:else if expanded}
    <div
      class="flex h-[75px] items-center justify-between gap-6 bg-data-surface-container-lowest px-5 py-4"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="size-4 shrink-0 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
        ></div>
        <div class="grid gap-2">
          <div
            class="h-3 w-36 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
          ></div>
          <div
            class="h-4 w-56 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
        </div>
      </div>
      <div class="flex items-center gap-5">
        <div class="grid justify-items-end gap-2">
          <div
            class="h-3 w-20 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
          <div
            class="h-4 w-24 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
        </div>
        <div
          class="size-5 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
        ></div>
      </div>
    </div>
    <div
      class="border-t border-data-outline-variant/60 bg-data-surface-container-low px-5 py-4"
    >
      <div class="grid gap-5">
        <div class="grid h-[52px] content-start gap-2">
          <div
            class="h-4 w-full rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
          <div
            class="h-4 w-[84%] rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
        </div>
        <div
          class="h-[104px] border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 py-2"
        >
          <div class="flex items-center gap-3">
            <div
              class="h-3 w-14 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
            ></div>
            <div
              class="h-3 w-10 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
            ></div>
            <div
              class="h-3 w-32 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
            ></div>
          </div>
          <div
            class="mt-3 h-3 w-40 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
          ></div>
          <div
            class="mt-3 h-3 w-56 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
          ></div>
        </div>
        <div
          class="-mx-5 -mb-4 grid h-[69px] grid-cols-3 gap-px border-t border-data-outline-variant/60 bg-data-outline-variant/60"
        >
          {#each Array(3) as _}
            <div class="bg-data-surface-container-low px-5 py-3">
              <div
                class="h-3 w-20 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
              ></div>
              <div
                class="mt-2 h-4 w-28 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
              ></div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</article>
