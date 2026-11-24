<script lang="ts">
import type { Snippet } from 'svelte'
import { Popover } from 'bits-ui'

type Props = {
  attribution?: string | null
  actions?: Snippet
}

let { attribution, actions }: Props = $props()
</script>

{#if attribution || actions}
  <footer
    class="border-data-outline-variant/60 text-data-on-surface-variant border-t bg-white px-6 py-2.5 md:px-8 dark:border-white/10 dark:bg-black dark:text-white/70"
  >
    <div class="max-xs:flex -mx-6 hidden items-center justify-between gap-2 px-6">
      {#if attribution}
        <Popover.Root>
          <Popover.Trigger
            class="rounded-default text-data-on-surface-variant hover:bg-data-surface-container-low hover:text-data-primary focus-visible:outline-data-primary -ml-4 inline-flex size-10 shrink-0 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="Show copyright notice"
            title="Copyright"
          >
            <span class="font-body text-base leading-none" aria-hidden="true">©</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              class="border-data-outline-variant/70 font-body text-caption text-data-on-surface shadow-popover data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 z-70 w-[calc(100vw-3rem)] border bg-white px-6 py-2.5 leading-5 dark:border-white/10 dark:bg-black dark:text-white/80"
              side="top"
              align="start"
              alignOffset={-9}
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
      <p class="font-body text-caption max-xs:hidden text-center leading-5">
        {attribution}
      </p>
    {/if}
  </footer>
{/if}
