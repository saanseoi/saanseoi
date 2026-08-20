<script lang="ts">
import type { Snippet } from 'svelte'
import { Popover } from 'bits-ui'

import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  attribution?: string | null
  actions?: Snippet
}

let { attribution, actions }: Props = $props()
</script>

{#if attribution || actions}
  <footer
    class="border-t border-data-outline-variant/60 bg-white px-6 py-2.5 text-data-on-surface-variant md:px-8 dark:border-white/10 dark:bg-black dark:text-white/70"
  >
    <div class="-mx-6 hidden items-center justify-between gap-2 px-6 max-[30rem]:flex">
      {#if attribution}
        <Popover.Root>
          <Popover.Trigger
            class="inline-flex size-10 shrink-0 items-center justify-center rounded-default text-data-on-surface-variant transition-colors hover:bg-data-surface-container-low hover:text-data-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-data-primary"
            aria-label="Show copyright notice"
            title="Copyright"
          >
            <span class="font-body text-base leading-none" aria-hidden="true">©</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              class="z-70 w-[calc(100vw-3rem)] border border-data-outline-variant/70 bg-white px-6 py-2.5 font-body text-caption leading-5 text-data-on-surface shadow-popover data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 dark:border-white/10 dark:bg-black dark:text-white/80"
              side="top"
              align="start"
              alignOffset={-24}
              sideOffset={8}
              collisionPadding={12}
            >
              {attribution}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      {/if}

      {#if actions}
        {@render actions()}
      {/if}
    </div>
    {#if attribution}
      <p class="text-center font-body text-caption leading-5 max-[30rem]:hidden">
        {attribution}
      </p>
    {/if}
  </footer>
{/if}
