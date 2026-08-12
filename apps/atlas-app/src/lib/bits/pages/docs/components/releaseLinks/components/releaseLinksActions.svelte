<script lang="ts">
import Icon from '@iconify/svelte'

import type { ReleaseLinkAction } from './releaseLinks.types'

type Props = { actions?: ReleaseLinkAction[] }

let { actions = [] }: Props = $props()
</script>

{#if actions.length}
  <nav aria-label="Release actions" class="flex flex-wrap gap-2">
    {#each actions as action (action.id)}
      {#if action.href && !action.disabled}
        <a
          class="inline-flex items-center gap-1.5 rounded-default border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 py-2 font-body text-label-sm font-semibold text-foreground-alt transition hover:text-data-primary focus-visible:outline-2 focus-visible:outline-secondary"
          href={action.href}
          download={action.download}
        >
          {#if action.icon}
            <Icon icon={action.icon} class="size-4" aria-hidden="true" />
          {/if}
          {action.label}
        </a>
      {:else}
        <span
          class:cursor-not-allowed={action.disabled}
          class:opacity-50={action.disabled}
          class="inline-flex items-center gap-1.5 rounded-default border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 py-2 font-body text-label-sm font-semibold text-foreground-alt"
          aria-disabled={action.disabled}
        >
          {#if action.icon}
            <Icon icon={action.icon} class="size-4" aria-hidden="true" />
          {/if}
          {action.label}
        </span>
      {/if}
    {/each}
  </nav>
{/if}
