<script lang="ts">
import type { Snippet } from 'svelte'
import Info from '@iconify-svelte/proicons/info'
import { Tooltip } from 'bits-ui'

type Props = {
  children?: Snippet
  description: string
  label: string
  title: string
}

let { children, description, label, title }: Props = $props()
</script>

<Tooltip.Provider delayDuration={200}>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 px-2">
    <div class="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
      <h3 class="text-lg font-medium">{title}</h3>
      {@render children?.()}
    </div>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full text-foreground-alt transition hover:bg-current/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
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
          class="z-70 max-w-72 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 text-sm text-foreground shadow-popover"
          >{description}</Tooltip.Content
        >
      </Tooltip.Portal>
    </Tooltip.Root>
  </div>
</Tooltip.Provider>
