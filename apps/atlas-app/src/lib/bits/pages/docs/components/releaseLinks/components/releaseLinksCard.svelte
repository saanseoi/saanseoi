<script lang="ts">
import Icon from '@iconify/svelte'
import type { Snippet } from 'svelte'
import { slide } from 'svelte/transition'

import type { ReleaseLinkHeaderFact, ReleaseLinkTitlePart } from './releaseLinks.types'

type Props = {
  accentColour?: string
  children?: Snippet
  detail?: string
  detailLabel?: string
  eyebrow: string
  eyebrowColour?: string
  expanded?: boolean
  headerFacts?: ReleaseLinkHeaderFact[]
  href: string
  id?: string
  publisherLogoSrc?: string
  publisherName?: string
  title: string
  titleColour?: string
  titleParts?: ReleaseLinkTitlePart[]
}

let {
  accentColour = 'var(--data-primary)',
  children,
  detail,
  detailLabel,
  eyebrow,
  eyebrowColour = 'var(--data-primary)',
  expanded: initiallyExpanded = false,
  headerFacts,
  href,
  id,
  publisherLogoSrc,
  publisherName,
  title,
  titleColour,
  titleParts,
}: Props = $props()

const getInitialExpanded = () => initiallyExpanded
let expanded = $state(getInitialExpanded())
let contentId = $derived(id ? `${id}-content` : undefined)
</script>

{#snippet heading()}
  {#if publisherLogoSrc}
    <img
      class="size-7.5 shrink-0 object-contain"
      src={publisherLogoSrc}
      alt={publisherName ?? ''}
      title={publisherName}
    >
  {/if}
  {#if headerFacts?.length}
    <span class="flex shrink-0 items-baseline gap-x-5 whitespace-nowrap">
      {#each headerFacts as fact, index}
        {#if index > 0}
          <span class="text-foreground-alt/60" aria-hidden="true">·</span>
        {/if}
        <span class="inline-flex shrink-0 items-baseline gap-x-2">
          {#if fact.label}
            <span
              class="shrink-0 font-body text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt/70"
            >
              {fact.label}
            </span>
          {/if}
          <span
            class="truncate font-mono text-label-md font-semibold text-primary"
            title={fact.value}
          >
            {fact.value}
          </span>
        </span>
      {/each}
    </span>
  {:else}
    {#if eyebrow}
      <span
        class="shrink-0 font-body text-caption font-semibold uppercase tracking-[0.08em]"
        style:color={eyebrowColour}
      >
        {eyebrow}
      </span>
    {/if}
    <span
      class="inline-flex min-w-0 flex-1 flex-wrap items-baseline wrap-break-word font-mono text-body-md font-bold leading-tight tracking-tight text-primary"
      style:color={titleParts ? undefined : titleColour}
    >
      {#if titleParts}
        {#each titleParts as part}
          <span class:opacity-60={part.muted} style:color={part.colour ?? titleColour}>
            {part.value}
          </span>
        {/each}
      {:else}
        {title}
      {/if}
    </span>
  {/if}
{/snippet}

<article
  {id}
  class="scroll-mt-32 overflow-hidden rounded-md border border-data-outline-variant/60 bg-data-surface-container-low"
>
  <div
    class="flex flex-col gap-4 bg-data-surface-container-lowest px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
  >
    {#if children}
      <button
        class="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary"
        type="button"
        aria-controls={contentId}
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <Icon
          icon="ion:chevron-down-outline"
          class={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          style={`color: ${accentColour}`}
          aria-hidden="true"
        />
        {@render heading()}
      </button>
    {:else}
      <div class="flex min-w-0 flex-1 items-center gap-3 text-left">
        {@render heading()}
      </div>
    {/if}
    <a
      class="group flex min-w-0 w-full items-end justify-end gap-5 text-right focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-secondary sm:w-md sm:shrink-0"
      {href}
    >
      {#if detailLabel && detail}
        <span class="font-body text-label-md text-foreground-alt">
          <span
            class="block text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt/70"
          >
            {detailLabel}
          </span>
          <span
            class="mt-1 block font-semibold whitespace-nowrap text-primary"
            title={detail}
            >{detail}</span
          >
        </span>
      {:else if detail}
        <span class="min-w-0 font-body text-label-md text-foreground-alt"
          >{detail}</span
        >
      {/if}
      <Icon
        icon="ion:arrow-forward-outline"
        class="size-5 shrink-0 transition-transform group-hover:translate-x-1"
        style={`color: ${accentColour}`}
        aria-hidden="true"
      />
    </a>
  </div>
  {#if expanded && children}
    <div
      id={contentId}
      class="border-t border-data-outline-variant/60 bg-data-surface-container-low px-5 py-4"
      transition:slide={{ duration: 180 }}
    >
      {@render children()}
    </div>
  {/if}
</article>
