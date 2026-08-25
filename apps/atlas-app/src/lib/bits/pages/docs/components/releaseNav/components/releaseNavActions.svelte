<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import { fade } from 'svelte/transition'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
import type { ReleaseNavAction } from '../releaseNav.types'
import ReleaseNavInfoAction from './releaseNavInfoAction.svelte'

type Props = {
  actions?: ReleaseNavAction[]
  analyticsSurface: ReleaseAnalyticsSurface
}
let { actions = [], analyticsSurface }: Props = $props()
</script>

<div class="ml-auto flex h-10 items-center gap-1 md:gap-4">
  {#each actions as action (action.id)}
    {#if action.infoDescription && action.icon}
      <ReleaseNavInfoAction
        description={action.infoDescription}
        icon={action.icon}
        label={action.label}
      />
    {:else if action.options}
      <label
        class="relative inline-flex h-8 items-center border border-data-outline-variant/70 bg-background text-foreground-alt transition hover:border-data-primary hover:text-data-primary focus-within:border-secondary focus-within:text-secondary"
      >
        <span class="sr-only">{action.label}</span>
        <select
          class="h-full cursor-pointer appearance-none bg-transparent py-0 pl-3 pr-8 font-body text-label-md font-semibold outline-hidden"
          aria-label={action.label}
          disabled={action.disabled}
          value={action.value}
          onchange={event => action.onValueChange?.(event.currentTarget.value)}
        >
          {#each action.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <Icon
          icon="ion:chevron-down-outline"
          class="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2"
          aria-hidden="true"
        />
      </label>
    {:else if action.href && !action.disabled}
      <a
        transition:fade={{ duration: 150 }}
        class={`inline-flex size-10 cursor-pointer items-center justify-center border border-data-outline-variant/70 font-body text-label-md font-semibold ${action.pressed ? 'text-data-primary hover:bg-data-surface-container-high' : 'text-foreground-alt hover:bg-data-surface-container-high hover:text-data-primary'} transition md:h-8 md:w-auto md:justify-start md:gap-2 md:px-3`}
        href={action.href}
        download={action.download}
        onclick={() =>
          action.download &&
          trackClientProductUsage({
            event: 'client.download_click',
            surface: action.analyticsSurface ?? analyticsSurface,
            entityType: 'asset',
            entityId: action.href?.split('/').filter(Boolean).at(-1),
          })}
        aria-label={action.label}
      >
        {#if action.icon}
          <Icon icon={action.icon} class="size-5 md:size-4" aria-hidden="true" />
        {/if}
        <span class="hidden md:inline">{action.label}</span>
      </a>
    {:else}
      <button
        transition:fade={{ duration: 150 }}
        class={`inline-flex size-10 items-center justify-center border border-data-outline-variant/70 font-body text-label-md font-semibold transition ${action.disabled ? 'cursor-not-allowed text-foreground-alt/50' : action.pressed ? 'cursor-pointer text-data-primary hover:bg-data-surface-container-high' : 'cursor-pointer text-foreground-alt hover:bg-data-surface-container-high hover:text-data-primary'} md:h-8 md:w-auto md:justify-start md:gap-2 md:px-3`}
        type="button"
        aria-label={action.label}
        aria-pressed={action.pressed}
        disabled={action.disabled}
        onclick={action.onSelect}
      >
        {#if action.icon}
          <Icon icon={action.icon} class="size-5 md:size-4" aria-hidden="true" />
        {/if}
        <span class="hidden md:inline">{action.label}</span>
      </button>
    {/if}
  {/each}
</div>
