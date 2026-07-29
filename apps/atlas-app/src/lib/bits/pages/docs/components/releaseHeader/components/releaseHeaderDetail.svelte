<script lang="ts">
import Icon from '@iconify/svelte'
import { slide } from 'svelte/transition'

type Detail = {
  label: string
  value: string
  isMonospace?: boolean
  disclosure?: Array<{
    label: string
    value: string
    isMonospace?: boolean
    href?: string
    isExternal?: boolean
  }>
}

type Props = {
  detail: Detail
  isOpen: boolean
  onToggle: () => void
}

let { detail, isOpen, onToggle }: Props = $props()
</script>

<div class="min-w-0">
  <button
    class="group cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
    type="button"
    aria-expanded={isOpen}
    onclick={onToggle}
  >
    <span
      class="flex items-center gap-1 text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt"
    >
      {detail.label}
      <Icon
        icon="ion:chevron-down-outline"
        class={`size-3.5 transition-transform duration-180 ${isOpen ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </span>
    <span
      class={`mt-2 block text-sm font-semibold text-primary ${detail.isMonospace ? 'font-mono whitespace-nowrap' : ''}`}
    >
      {detail.value}
    </span>
  </button>

  {#if isOpen}
    <dl
      class="mt-4 grid gap-3 border-l-2 border-outline-variant pl-4"
      transition:slide={{ duration: 180, axis: 'y' }}
    >
      {#each detail.disclosure ?? [] as item}
        <div>
          <dt
            class="text-caption font-semibold uppercase tracking-widest text-foreground-alt"
          >
            {item.label}
          </dt>
          <dd
            class={`mt-1.5 text-sm font-semibold leading-5 text-primary ${item.isMonospace ? 'font-mono whitespace-nowrap' : ''}`}
          >
            {#if item.href}
              <a
                class="inline-flex items-center gap-1 text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
                href={item.href}
                target={item.isExternal ? '_blank' : undefined}
                rel={item.isExternal ? 'noopener noreferrer' : undefined}
              >
                {item.value}
                {#if item.isExternal}
                  <Icon icon="ion:open-outline" class="size-3.5" aria-hidden="true" />
                {/if}
              </a>
            {:else}
              {item.value}
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  {/if}
</div>
