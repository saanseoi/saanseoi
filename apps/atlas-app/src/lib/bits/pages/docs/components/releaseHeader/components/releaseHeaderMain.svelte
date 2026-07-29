<script lang="ts">
import Icon from '@iconify/svelte'
import type { Snippet } from 'svelte'

import ReleaseHeaderDetail from './releaseHeaderDetail.svelte'

type Detail = {
  label: string
  value: string
  href?: string
  isExternal?: boolean
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
  title: string
  details: Detail[]
  description?: Snippet
}

let { title, details, description }: Props = $props()
let allDetailsOpen = $state(false)
</script>

<div class="min-w-0">
  <h1 class="font-display text-headline-lg font-bold text-primary md:text-display-sm">
    {title}
  </h1>
  {#if description}
    {@render description()}
  {/if}
  <dl
    class="mt-7 grid grid-cols-1 gap-x-6 gap-y-5 font-body text-label-md md:grid-cols-3"
  >
    {#each details as detail}
      {#if detail.disclosure?.length}
        <ReleaseHeaderDetail
          {detail}
          isOpen={allDetailsOpen}
          onToggle={() => (allDetailsOpen = !allDetailsOpen)}
        />
      {:else}
        <div class="min-w-0">
          <dt
            class="text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt"
          >
            {detail.label}
          </dt>
          <dd
            class={`mt-2 text-sm font-semibold text-primary ${detail.isMonospace ? 'font-mono' : ''}`}
          >
            {#if detail.href}
              <a
                class="inline-flex items-center gap-1 font-body font-semibold text-secondary underline decoration-secondary/40 underline-offset-4 hover:text-primary"
                href={detail.href}
                target={detail.isExternal ? '_blank' : undefined}
                rel={detail.isExternal ? 'noopener noreferrer' : undefined}
              >
                {detail.value}
                {#if detail.isExternal}
                  <Icon icon="ion:open-outline" class="size-4" aria-hidden="true" />
                {/if}
              </a>
            {:else}
              {detail.value}
            {/if}
          </dd>
        </div>
      {/if}
    {/each}
  </dl>
</div>
