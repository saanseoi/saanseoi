<script lang="ts">
import { Popover } from 'bits-ui'
import ReviewActionIcon from './ReviewActionIcon.svelte'
import type { ProductionReview } from './productionReviews'
let {
  entries,
  onOpen,
  onRemove,
}: {
  entries: ProductionReview[]
  onOpen: (entry: ProductionReview) => void
  onRemove: (entry: ProductionReview) => void
} = $props()
let open = $state(false)
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-screen-2xl items-start px-4 sm:px-8"
>
  <Popover.Root bind:open>
    <Popover.Trigger
      class="pointer-events-auto relative flex size-[3.875rem] items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest/95 text-foreground shadow-lg backdrop-blur-md transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label="Toggle production review queue"
      title={`Production review queue · ${entries.length} pending tables`}
    >
      <ReviewActionIcon kind="queue" />
      {#if entries.length}
        <span
          aria-hidden="true"
          class="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-surface"
          >{entries.length}</span
        >
      {/if}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="top"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        aria-label="Production review queue"
        class="z-[60] max-h-[min(70dvh,36rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 text-foreground shadow-xl outline-none"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">Production review · {entries.length} tables</h2>
          <Popover.Close
            class="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Close production review queue"
            ><ReviewActionIcon kind="close" /></Popover.Close
          >
        </div>
        <p class="mt-1 text-sm text-foreground-alt">
          Awaiting verification against production data.
        </p>
        {#if entries.length}
          <ul
            class="mt-3 divide-y divide-outline-variant"
            aria-label="Tables awaiting production review"
          >
            {#each entries as entry (`${entry.kind}/${entry.group}/${entry.table}`)}
              <li class="space-y-3 py-3">
                <div class="min-w-0">
                  <p class="font-mono text-sm wrap-break-word">
                    {entry.kind}
                    · {entry.table}
                  </p>
                  <p class="text-xs text-foreground-alt wrap-break-word">
                    {entry.groupLabel}
                    · {new Date(entry.markedAt).toLocaleString()}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-outline-variant px-3 py-2 text-sm hover:bg-surface-container"
                    onclick={() => {
                      open = false
                      onOpen(entry)
                    }}
                  >
                    Open local view
                  </button><button
                    type="button"
                    class="rounded-lg border border-outline-variant px-3 py-2 text-sm hover:bg-surface-container"
                    onclick={() => onRemove(entry)}
                  >
                    Return to local review
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="py-6 text-sm text-foreground-alt">
            No tables marked for production review.
          </p>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>
