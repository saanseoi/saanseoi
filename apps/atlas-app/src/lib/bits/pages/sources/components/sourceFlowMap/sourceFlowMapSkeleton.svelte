<script lang="ts">
const lanes = [
  { id: 'skeleton-divisions', inputs: 2 },
  { id: 'skeleton-addresses', inputs: 1 },
  { id: 'skeleton-places', inputs: 3 },
  { id: 'skeleton-streets', inputs: 1 },
  { id: 'skeleton-stats', inputs: 2 },
]
</script>

<div
  class="grid gap-4"
  aria-busy="true"
  aria-live="polite"
  data-source-flow-skeleton
  role="status"
>
  <span class="sr-only">Loading sources</span>
  {#each lanes as lane (lane.id)}
    <div
      class="grid min-h-38 grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.46fr)_minmax(14rem,0.72fr)] items-start gap-5 border-b border-[color-mix(in_srgb,var(--outline-variant)_82%,transparent)] py-4 last:border-b-0 max-[900px]:grid-cols-1 max-[900px]:gap-3 max-[900px]:pt-4 max-[900px]:pb-5"
    >
      <div class="grid gap-3">
        {#each Array(lane.inputs) as _, inputIndex (`${lane.id}-${inputIndex}`)}
          <div
            class="grid min-h-[5.65rem] grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 rounded-lg border border-[color-mix(in_srgb,var(--outline-variant)_78%,transparent)] p-[0.9rem_1rem] animate-[source-flow-skeleton-shimmer_1.4s_ease-in-out_infinite] overflow-hidden bg-[linear-gradient(105deg,color-mix(in_srgb,var(--surface-container-low)_96%,transparent)_0%,color-mix(in_srgb,var(--surface-container-high)_82%,transparent)_45%,color-mix(in_srgb,var(--surface-container-low)_96%,transparent)_72%)] bg-size-[200%_100%] motion-reduce:animate-none"
            aria-hidden="true"
          >
            <span
              class="size-18 rounded-[0.35rem] border border-[color-mix(in_srgb,var(--outline-variant)_68%,transparent)] bg-[color-mix(in_srgb,var(--foreground-alt)_10%,transparent)]"
            ></span>
            <span class="grid gap-[0.65rem]">
              <span
                class="block h-[0.72rem] rounded-full bg-[color-mix(in_srgb,var(--foreground-alt)_12%,transparent)]"
              ></span>
              <span
                class="block h-[0.72rem] w-[58%] rounded-full bg-[color-mix(in_srgb,var(--foreground-alt)_12%,transparent)]"
              ></span>
            </span>
          </div>
        {/each}
      </div>
      <div
        class="col-start-3 mt-2 min-h-[5.65rem] overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--outline-variant)_78%,transparent)] bg-[linear-gradient(105deg,color-mix(in_srgb,var(--surface-container-low)_96%,transparent)_0%,color-mix(in_srgb,var(--surface-container-high)_82%,transparent)_45%,color-mix(in_srgb,var(--surface-container-low)_96%,transparent)_72%)] bg-size-[200%_100%] animate-[source-flow-skeleton-shimmer_1.4s_ease-in-out_infinite] motion-reduce:animate-none max-[900px]:col-auto max-[900px]:ml-4"
        aria-hidden="true"
      ></div>
    </div>
  {/each}
</div>

<style>
@keyframes source-flow-skeleton-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
</style>
