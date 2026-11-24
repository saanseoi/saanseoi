<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Tooltip } from 'bits-ui'
let { label, description }: { label: string; description: string } = $props()
</script>
<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        class="text-foreground-alt hover:bg-data-surface-container-high hover:text-data-primary inline-flex size-5 shrink-0 items-center justify-center rounded-full transition"
        type="button"
        aria-label={label}
      >
        <Icon icon="proicons:info" class="size-3.5" aria-hidden="true" />
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      class="rounded-default border-border-card/60 bg-background-alt font-body text-label-sm text-foreground shadow-popover z-70 max-w-64 border px-3 py-2"
      side="top"
      sideOffset={8}
    >
      {description}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>
