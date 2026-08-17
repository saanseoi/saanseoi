<div
  class="grid animate-pulse gap-6"
  aria-busy="true"
  aria-label="Loading statistics"
  role="status"
>
  <section
    class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
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
      ] as metric}
        <div class={`border-t-8 bg-data-surface-container-low px-5 py-6 ${metric[0]}`}>
          <div class="flex items-center gap-2">
            <span class={`size-2 rounded-full ${metric[1]}`}></span>
            <span class="h-4 w-16 rounded-full bg-data-surface-container-high"></span>
          </div>
          <div
            class={`mt-3 h-5 rounded-md bg-data-surface-container-high ${metric[2]}`}
          ></div>
        </div>
      {/each}
    </div>
  </section>

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
