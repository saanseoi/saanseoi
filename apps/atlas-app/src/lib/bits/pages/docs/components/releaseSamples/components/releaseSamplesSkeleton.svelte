<script lang="ts">
type Props = {
  label?: string
  showDescription?: boolean
}

let { label = 'Loading samples', showDescription = false }: Props = $props()
</script>

<div
  class:space-y-4={showDescription}
  class="motion-safe:animate-pulse"
  role="status"
  aria-label={label}
  aria-busy="true"
>
  {#if showDescription}
    <div class="h-5 w-5/6 rounded bg-surface-container-high" aria-hidden="true"></div>
  {/if}

  <div
    class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
    aria-hidden="true"
  >
    <div>
      {#each ['w-2/5', 'w-1/3', 'w-3/5', 'w-1/2', 'w-2/3', 'w-1/2'] as width, index}
        <div
          class={`grid grid-cols-[minmax(5rem,0.32fr)_minmax(0,1fr)] gap-5 px-4 py-5 ${index === 0 ? 'bg-surface-container-low' : 'border-t border-outline-variant/70'}`}
        >
          <div class="h-4 w-3/5 rounded bg-surface-container-high"></div>
          <div class={`h-4 rounded bg-surface-container-high ${width}`}></div>
        </div>
      {/each}
    </div>
  </div>
</div>
