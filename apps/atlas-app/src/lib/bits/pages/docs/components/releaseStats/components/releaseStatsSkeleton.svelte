<script lang="ts">
import OverviewSkeleton from './releaseStatsOverviewSkeleton.svelte'
</script>

<div
  class="grid animate-pulse gap-6"
  aria-busy="true"
  aria-label="Loading statistics"
  role="status"
>
  <OverviewSkeleton />

  <section
    class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
  >
    <div
      class="border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-6"
    >
      <div class="h-3 w-20 rounded-full bg-data-surface-container-high"></div>
      <div class="mt-2 h-5 w-44 rounded-md bg-data-surface-container-high"></div>
    </div>

    <div
      class="relative aspect-3/2 bg-data-surface-container-lowest lg:h-152 lg:aspect-auto"
      aria-busy="true"
      aria-label="Loading records by district"
      role="img"
    >
      <div class="absolute inset-0 bg-data-surface-container-low opacity-60"></div>
      <div
        class="absolute inset-6 rounded-[42%] border border-data-outline-variant/40 opacity-60"
      ></div>
      <div
        class="absolute inset-y-[18%] left-[18%] w-[54%] rounded-[45%] border border-data-outline-variant/40 opacity-60"
      ></div>
      <div
        class="absolute bottom-6 left-6 h-2 w-36 rounded-full bg-data-surface-container-high opacity-70"
      ></div>
    </div>
  </section>
</div>
