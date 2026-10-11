<script lang="ts">
let { label }: { label: string } = $props()
</script>

<div
  class="space-y-2 motion-safe:animate-pulse"
  role="status"
  aria-label={label}
  aria-busy="true"
>
  {#each ['w-2/5', 'w-1/3', 'w-1/2'] as width}
    <div
      class="flex items-center gap-3 rounded-md border border-outline-variant border-l-4 bg-surface-container-low px-4 py-2"
      aria-hidden="true"
    >
      <div class="size-4 rounded bg-surface-container-high"></div>
      <div class="min-w-0 flex-1">
        <div class="flex h-lh items-center text-body-md">
          <div class={`h-4 rounded bg-surface-container-high ${width}`}></div>
        </div>
        <div class="mt-0.5 flex h-5 items-center gap-2 text-caption">
          <div class="h-3 w-1/4 rounded bg-surface-container-high"></div>
          <div class="h-4 w-14 rounded bg-surface-container-high"></div>
          <div class="h-4 w-16 rounded bg-surface-container-high"></div>
        </div>
      </div>
      <div class="flex h-8 w-10 shrink-0 items-center justify-center">
        <div class="h-3 w-4 rounded bg-surface-container-high"></div>
      </div>
    </div>
  {/each}
</div>
