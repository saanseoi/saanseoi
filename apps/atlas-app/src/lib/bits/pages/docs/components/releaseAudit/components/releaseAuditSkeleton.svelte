<section
  class="animate-pulse space-y-6 rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-6 dark:border-outline-variant"
  aria-busy="true"
  aria-label="Loading audit"
  role="status"
>
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div class="h-8 w-40 rounded-md bg-surface-container-high"></div>
    <div class="h-9 w-56 rounded-md bg-surface-container-high"></div>
  </div>
  {#each Array(4) as _}
    <div
      class="space-y-3 rounded-md border border-outline-variant/60 p-4 dark:border-outline-variant"
    >
      <div class="h-5 w-56 rounded-md bg-surface-container-high"></div>
      <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
      <div class="h-4 w-[76%] rounded-full bg-surface-container-high"></div>
    </div>
  {/each}
</section>
