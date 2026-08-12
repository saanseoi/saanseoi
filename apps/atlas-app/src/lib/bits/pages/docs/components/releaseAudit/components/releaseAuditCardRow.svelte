<script lang="ts">
import Icon from '@iconify/svelte'
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  details?: Snippet
  expanded?: boolean
  label?: string
  onToggle?: () => void
}

let { children, details, expanded = false, label, onToggle }: Props = $props()
</script>

{#if onToggle}
  <article class="bg-data-surface-container-low">
    <button
      class="flex w-full cursor-pointer items-center justify-between gap-6 px-5 py-4 text-left"
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onclick={onToggle}
    >
      <div class="min-w-0 flex-1">{@render children?.()}</div>
      <Icon
        icon="ion:chevron-down-outline"
        class={`size-4 shrink-0 text-data-primary transition-transform ${expanded ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
    {#if details}
      <div
        class={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div class="min-h-0">{@render details()}</div>
      </div>
    {/if}
  </article>
{:else}
  <div class="grid gap-4 bg-data-surface-container-low px-5 py-4 sm:grid-cols-2">
    {@render children?.()}
  </div>
{/if}
