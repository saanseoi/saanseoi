<section
  role="status"
  aria-label="Loading change statistics"
  aria-busy="true"
  class="motion-safe:animate-pulse overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
>
  <div
    class="flex items-start justify-between gap-4 border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-6"
  >
    <div>
      <div class="h-3 w-28 rounded-full bg-data-surface-container-high"></div>
      <div class="mt-2 h-5 w-32 rounded-md bg-data-surface-container-high"></div>
    </div>
    <div class="size-4 rounded-full bg-data-surface-container-high"></div>
  </div>

  <div class="grid grid-cols-2 gap-px bg-data-outline-variant/60 sm:grid-cols-4">
    {#each [
      ['border-data-success', 'bg-data-success', 'w-14'],
      ['border-data-warning', 'bg-data-warning', 'w-16'],
      ['border-data-error', 'bg-data-error', 'w-14'],
      ['border-data-neutral', 'bg-data-neutral', 'w-20'],
    ] as measure}
      <div class={`border-t-8 bg-data-surface-container-low px-5 py-6 ${measure[0]}`}>
        <div class="flex items-center gap-2">
          <span class={`size-2 rounded-full ${measure[1]}`}></span>
          <span class="h-4 w-16 rounded-full bg-data-surface-container-high"></span>
        </div>
        <div
          class={`mt-3 h-5 rounded-md bg-data-surface-container-high ${measure[2]}`}
        ></div>
      </div>
    {/each}
  </div>
</section>
