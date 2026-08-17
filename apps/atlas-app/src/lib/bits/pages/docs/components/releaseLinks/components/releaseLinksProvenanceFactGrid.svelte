<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Tooltip } from 'bits-ui'

import type { ReleaseLinkFact } from './releaseLinks.types'

type Props = { facts?: ReleaseLinkFact[] }

let { facts = [] }: Props = $props()
</script>

{#if facts.length}
  <dl
    class="-mx-5 -mb-4 grid gap-px overflow-hidden border-t border-data-outline-variant/60 bg-data-outline-variant/60 sm:grid-cols-[repeat(3,minmax(max-content,1fr))]"
  >
    {#each facts as fact}
      <div class="bg-data-surface-container-low px-5 py-3">
        <dt
          class="flex items-center gap-1.5 font-body text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
        >
          <span>{fact.label}</span>
          {#if fact.description}
            <Tooltip.Root>
              <Tooltip.Trigger>
                <button
                  class="inline-flex size-4 items-center justify-center rounded-full text-foreground-alt transition hover:text-data-primary"
                  type="button"
                  aria-label={`About ${fact.label}`}
                >
                  <Icon icon="proicons:info" class="size-3" aria-hidden="true" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  class="z-70 max-w-64 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm normal-case tracking-normal text-foreground shadow-popover"
                  side="top"
                  sideOffset={8}
                >
                  {fact.description}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          {/if}
        </dt>
        <dd
          class="mt-1 font-mono text-label-md font-semibold whitespace-nowrap text-primary"
        >
          {fact.value}
        </dd>
      </div>
    {/each}
  </dl>
{/if}
