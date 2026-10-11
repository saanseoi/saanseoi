<script lang="ts">
import { DropdownMenu } from 'bits-ui'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
import type { ReleaseNavAction } from '../releaseNav.types'

let {
  action,
  analyticsSurface,
}: {
  action: ReleaseNavAction
  analyticsSurface: ReleaseAnalyticsSurface
} = $props()
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    aria-label={action.label}
    title={action.tooltip}
    class="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border border-data-outline-variant/70 px-3 font-body text-label-md font-semibold text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary"
  >
    <Icon icon="proicons:arrow-download" class="size-4" aria-hidden="true" />
    <span>{action.label}</span>
    <Icon icon="proicons:chevron-down" class="size-3.5" aria-hidden="true" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      align="end"
      sideOffset={4}
      class="z-70 min-w-44 border border-data-outline-variant/70 bg-background p-1 shadow-popover"
    >
      {#each action.downloadLinks ?? [] as link (link.href)}
        <DropdownMenu.Item
          onSelect={() =>
            trackClientProductUsage({
              event: 'client.download_click',
              surface: action.analyticsSurface ?? analyticsSurface,
              entityType: 'asset',
              entityId: link.href.split('/').filter(Boolean).at(-1),
            })}
        >
          {#snippet child({
            props,
          })}
            <a
              {...props}
              href={link.href}
              download
              class="flex cursor-pointer items-center gap-2 px-3 py-2 font-body text-label-md text-foreground-alt outline-none hover:bg-data-surface-container-high focus:bg-data-surface-container-high"
            >
              <Icon icon="proicons:arrow-download" class="size-4" aria-hidden="true" />
              {link.label}
            </a>
          {/snippet}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
