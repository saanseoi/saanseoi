<script lang="ts">
import type { Snippet } from 'svelte'
import Info from '@iconify-svelte/proicons/info'
import { Tooltip } from 'bits-ui'

type Props = {
  children?: Snippet
  description: string
  label: string
  title: string
  tocTitle?: string
}

let { children, description, label, title, tocTitle }: Props = $props()
</script>

<Tooltip.Provider delayDuration={200}>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
    <h3
      class="text-foreground-alt mr-auto text-xs font-medium tracking-widest uppercase"
      data-audit-toc-title={tocTitle}
    >
      {title}
    </h3>
    {#if children}
      <div class="ml-auto flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        {@render children()}
      </div>
    {/if}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="text-foreground-alt hover:text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            type="button"
            aria-label={label}
          >
            <Info class="size-4" aria-hidden="true" />
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          role="tooltip"
          side="top"
          sideOffset={8}
          class="rounded-default border-border-card/60 bg-background-alt text-foreground shadow-popover z-70 max-w-72 border px-3 py-2 text-sm"
          >{description}</Tooltip.Content
        >
      </Tooltip.Portal>
    </Tooltip.Root>
  </div>
</Tooltip.Provider>
