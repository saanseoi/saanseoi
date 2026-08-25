<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Tooltip } from 'bits-ui'

type Props = {
  description: string
  icon: string
  label: string
}

let { description, icon, label }: Props = $props()
</script>

<Tooltip.Provider delayDuration={200}>
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="inline-flex size-10 cursor-pointer items-center justify-center font-body text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary md:size-8"
          type="button"
          aria-label={label}
        >
          <Icon {icon} class="size-5 md:size-4" aria-hidden="true" />
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        class="z-70 max-w-64 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
        side="top"
        sideOffset={8}
      >
        {description}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
