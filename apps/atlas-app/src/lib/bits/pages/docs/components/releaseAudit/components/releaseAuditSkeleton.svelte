<script lang="ts">
import { Tooltip } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditControls from './releaseAuditControls.svelte'
</script>

<div class="grid gap-6" aria-busy="true" aria-label="Loading audit" role="status">
  <Tooltip.Provider delayDuration={200}>
    <ReleaseAuditControls
      filteredCount=""
      infoDescription={m.source_audit_info_description()}
      infoLabel={m.source_audit_info()}
      loading
      totalCount=""
    />
  </Tooltip.Provider>

  <article
    class="overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low"
  >
    <div
      class="min-h-[79px] border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-4"
    >
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="size-2 shrink-0 rounded-full bg-data-primary motion-safe:animate-pulse"
            ></span>
            <span
              class="h-3 w-44 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
            ></span>
          </div>
          <div
            class="mt-2 h-5 w-[min(24rem,78%)] rounded-md bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
        </div>
        <div class="justify-self-end text-right">
          <div
            class="ml-auto h-4 w-12 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
          <div
            class="mt-2 ml-auto h-3 w-28 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
          ></div>
        </div>
      </div>
    </div>

    <div class="divide-y divide-data-outline-variant/60">
      {#each Array(8) as _, index}
        <div class="grid gap-4 bg-data-surface-container-low px-5 py-4 sm:grid-cols-2">
          <div class="min-w-0">
            <div
              class="h-3 rounded-full bg-data-surface-container-high motion-safe:animate-pulse {index % 3 === 0
                ? 'w-36'
                : index % 3 === 1
                  ? 'w-28'
                  : 'w-32'}"
            ></div>
            <div
              class="mt-2 h-4 rounded-full bg-data-primary/60 motion-safe:animate-pulse {index % 4 === 0
                ? 'w-44'
                : index % 4 === 1
                  ? 'w-56'
                  : index % 4 === 2
                    ? 'w-64'
                    : 'w-40'}"
            ></div>
          </div>
          <div class="flex min-w-0 items-start justify-between gap-4 sm:justify-end">
            <div class="min-w-0 sm:text-right">
              <div
                class="ml-auto h-3 w-14 rounded-full bg-data-surface-container-high motion-safe:animate-pulse"
              ></div>
              <div
                class="mt-2 ml-auto h-4 rounded-full bg-data-surface-container-high motion-safe:animate-pulse {index % 3 === 0
                  ? 'w-16'
                  : index % 3 === 1
                    ? 'w-24'
                    : 'w-20'}"
              ></div>
            </div>
            <span
              class="mt-1 size-4 shrink-0 rounded-full bg-data-primary/60 motion-safe:animate-pulse"
            ></span>
          </div>
        </div>
      {/each}
    </div>
  </article>
</div>
