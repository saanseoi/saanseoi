<script lang="ts">
const loadingLabel = 'Loading source release'
</script>

<div
  class="min-h-[calc(100svh-6rem)] animate-pulse"
  aria-busy="true"
  aria-label={loadingLabel}
  role="status"
>
  <section
    class="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-outline-variant/60 bg-surface-container-low px-6 py-3 dark:border-outline-variant md:px-8"
    >
      <div class="h-3 w-28 rounded-full bg-surface-container-high"></div>
      <div class="h-7 w-20 rounded-sm bg-surface-container-high"></div>
    </div>

    <div
      class="grid gap-8 px-6 py-7 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10"
    >
      <div class="min-w-0">
        <div class="h-10 w-72 max-w-full rounded-md bg-surface-container-high"></div>
        <div class="mt-3 space-y-2">
          <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[92%] rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[68%] rounded-full bg-surface-container-high"></div>
        </div>

        <div class="mt-7 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-3">
          <div>
            <div class="h-3 w-16 rounded-full bg-surface-container-high"></div>
            <div class="mt-2 space-y-1.5">
              <div class="h-4 w-28 rounded-full bg-surface-container-high"></div>
              <div class="h-4 w-24 rounded-full bg-surface-container-high"></div>
            </div>
          </div>
          <div>
            <div class="h-3 w-20 rounded-full bg-surface-container-high"></div>
            <div class="mt-2 h-4 w-32 rounded-full bg-surface-container-high"></div>
          </div>
          <div>
            <div class="h-3 w-24 rounded-full bg-surface-container-high"></div>
            <div class="mt-2 h-4 w-24 rounded-full bg-surface-container-high"></div>
          </div>
        </div>
      </div>

      <aside
        class="min-h-52 rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 dark:border-outline-variant"
      >
        <div class="h-3 w-20 rounded-full bg-surface-container-high"></div>
        <div class="mt-3 flex items-center gap-3">
          <div class="size-11 shrink-0 rounded-md bg-surface-container-high"></div>
          <div class="h-4 w-36 rounded-full bg-surface-container-high"></div>
          <div class="ml-auto size-4 rounded-full bg-surface-container-high"></div>
        </div>
        <div class="mt-4 space-y-2">
          <div class="h-3.5 w-full rounded-full bg-surface-container-high"></div>
          <div class="h-3.5 w-[90%] rounded-full bg-surface-container-high"></div>
          <div class="h-3.5 w-[74%] rounded-full bg-surface-container-high"></div>
        </div>
        <div class="mt-5 flex justify-between gap-3">
          <div class="h-4 w-16 rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-24 rounded-full bg-surface-container-high"></div>
        </div>
      </aside>
    </div>
  </section>

  <section class="mt-6">
    <div class="grid min-h-10 gap-8 xl:grid-cols-[1fr_18rem]">
      <div class="flex items-center gap-5 overflow-hidden">
        <div class="h-4 w-24 rounded-full bg-surface-container-high"></div>
        <div class="h-4 w-10 rounded-full bg-surface-container-high"></div>
        <div class="h-4 w-16 rounded-full bg-surface-container-high"></div>
        <div class="h-4 w-20 rounded-full bg-surface-container-high"></div>
        <div class="h-4 w-20 rounded-full bg-surface-container-high"></div>
      </div>
      <div class="hidden items-center justify-between xl:flex">
        <div class="h-3 w-20 rounded-full bg-surface-container-high"></div>
        <div class="flex gap-2">
          <div class="size-6 rounded-md bg-surface-container-high"></div>
          <div class="size-6 rounded-md bg-surface-container-high"></div>
        </div>
      </div>
    </div>

    <div class="grid gap-8 xl:grid-cols-[1fr_18rem]">
      <div
        class="mt-2 min-h-128 rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-5 dark:border-outline-variant"
      >
        <div class="h-8 w-44 rounded-md bg-surface-container-high"></div>
        <div class="mt-6 space-y-3">
          <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[94%] rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[72%] rounded-full bg-surface-container-high"></div>
        </div>
        <div class="mt-8 h-7 w-32 rounded-md bg-surface-container-high"></div>
        <div class="mt-6 space-y-3">
          <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[86%] rounded-full bg-surface-container-high"></div>
        </div>
        <div class="mt-8 h-7 w-36 rounded-md bg-surface-container-high"></div>
        <div class="mt-6 space-y-3">
          <div class="h-4 w-full rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[90%] rounded-full bg-surface-container-high"></div>
          <div class="h-4 w-[64%] rounded-full bg-surface-container-high"></div>
        </div>
      </div>

      <aside class="hidden xl:block">
        <div
          class="rounded-lg border border-outline-variant/60 bg-surface-container-lowest dark:border-outline-variant"
        >
          <div class="h-10 rounded-t-lg bg-surface-container-high"></div>
          <div class="space-y-4 p-4">
            <div class="h-7 rounded-md bg-surface-container-high"></div>
            <div class="h-4 w-24 rounded-full bg-surface-container-high"></div>
            <div class="h-4 w-28 rounded-full bg-surface-container-high"></div>
            <div class="h-4 w-24 rounded-full bg-surface-container-high"></div>
            <div class="h-4 w-32 rounded-full bg-surface-container-high"></div>
            <div class="ml-6 space-y-3 border-l border-outline-variant/60 pl-4">
              <div class="h-4 w-32 rounded-full bg-surface-container-high"></div>
              <div class="h-4 w-28 rounded-full bg-surface-container-high"></div>
              <div class="h-4 w-36 rounded-full bg-surface-container-high"></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</div>
