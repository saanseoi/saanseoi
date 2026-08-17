<section
  class="animate-pulse space-y-6 rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-6 dark:border-outline-variant"
  aria-busy="true"
  aria-label="Loading release difference"
  role="status"
>
  <div class="h-8 w-44 rounded-md bg-surface-container-high"></div>
  {#each Array(6) as _}
    <div class="h-5 rounded-full bg-surface-container-high"></div>
  {/each}
</section>
