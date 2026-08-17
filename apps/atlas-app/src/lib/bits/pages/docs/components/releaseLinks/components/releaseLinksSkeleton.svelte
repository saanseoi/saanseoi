<div
  class="animate-pulse space-y-6"
  aria-busy="true"
  aria-label="Loading release links"
  role="status"
>
  {#each Array(2) as _}
    <section
      class="overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
    >
      <div
        class="border-b border-outline-variant/60 px-5 py-4 dark:border-outline-variant"
      >
        <div class="h-3 w-24 rounded-full bg-surface-container-high"></div>
        <div class="mt-2 h-6 w-52 rounded-md bg-surface-container-high"></div>
      </div>
      <div class="space-y-5 p-5 pl-12">
        {#each Array(2) as _}
          <div
            class="space-y-3 rounded-md border border-outline-variant/60 p-4 dark:border-outline-variant"
          >
            <div class="h-5 w-48 rounded-md bg-surface-container-high"></div>
            <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
            <div class="h-4 w-[72%] rounded-full bg-surface-container-high"></div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>
