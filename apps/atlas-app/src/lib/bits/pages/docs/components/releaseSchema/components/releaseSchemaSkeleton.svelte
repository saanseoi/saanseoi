<script lang="ts">
let { label = 'Loading schema' }: { label?: string } = $props()
</script>

<div
  class="space-y-4 motion-safe:animate-pulse"
  role="status"
  aria-busy="true"
  aria-label={label}
>
  <div class="space-y-3" aria-hidden="true">
    <div class="h-4 w-full rounded bg-surface-container-high"></div>
    <div class="h-4 w-5/6 rounded bg-surface-container-high"></div>
    <div class="h-4 w-2/3 rounded bg-surface-container-high"></div>
  </div>

  <div
    class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
    aria-hidden="true"
  >
    <div class="space-y-3 bg-surface-container-low px-4 py-4">
      <div class="flex items-center justify-between gap-5">
        <div class="h-4 w-32 rounded bg-surface-container-high"></div>
        <div class="h-4 w-16 rounded bg-surface-container-high"></div>
      </div>
      <div class="h-3 w-3/5 rounded bg-surface-container-high"></div>
    </div>

    {#each [false, false, false, true, true, true] as nested, index}
      <div
        class:pl-10={nested}
        class="grid grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)] gap-5 border-t border-outline-variant/70 px-4 py-4"
      >
        <div
          class={`h-4 rounded bg-surface-container-high ${index % 3 === 0 ? 'w-3/5' : 'w-1/2'}`}
        ></div>
        <div class="space-y-2">
          <div class="h-3 w-16 rounded bg-surface-container-high"></div>
          <div
            class={`h-3 rounded bg-surface-container-high ${index % 2 === 0 ? 'w-2/3' : 'w-4/5'}`}
          ></div>
        </div>
      </div>
    {/each}
  </div>
</div>
