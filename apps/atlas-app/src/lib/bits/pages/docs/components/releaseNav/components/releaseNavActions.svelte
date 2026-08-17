<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { fade } from 'svelte/transition'
import type { ReleaseNavAction } from '../releaseNav.types'

type Props = { actions?: ReleaseNavAction[] }
let { actions = [] }: Props = $props()
</script>

<div class="ml-auto flex h-10 items-center gap-1 md:gap-4">
  {#each actions as action (action.id)}
    {#if action.href && !action.disabled}
      <a
        transition:fade={{ duration: 150 }}
        class={`inline-flex size-10 cursor-pointer items-center justify-center border-b-2 border-transparent font-body text-label-md font-semibold ${action.pressed ? 'text-secondary hover:text-white' : 'text-foreground-alt hover:text-white'} transition md:h-full md:w-auto md:justify-start md:gap-2 md:px-1`}
        href={action.href}
        download={action.download}
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
        class={`inline-flex size-10 items-center justify-center border-b-2 border-transparent font-body text-label-md font-semibold transition ${action.disabled ? 'cursor-not-allowed text-foreground-alt/50' : action.pressed ? 'cursor-pointer text-secondary hover:text-white' : 'cursor-pointer text-foreground-alt hover:text-white'} md:h-full md:w-auto md:justify-start md:gap-2 md:px-1`}
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
