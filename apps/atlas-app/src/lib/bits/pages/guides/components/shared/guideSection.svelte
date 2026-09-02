<script lang="ts">
import type { Snippet } from 'svelte'

import GuideParagraph from './guideParagraph.svelte'
import GuideProgressMarker from './guideProgressMarker.svelte'
import GuideTextHeader from './guideTextHeader.svelte'

type Props = {
  actionLabel?:
    | string
    | {
        current: number
        label: string
        total: number
      }
  children?: Snippet
  description?: string
  eyebrow?: string
  id: string
  intro?: string
  number?: number
  showBorder?: boolean
  step?: string
  title?: string
}

let {
  actionLabel,
  children,
  description,
  eyebrow,
  id,
  intro,
  number,
  showBorder = true,
  step,
  title,
}: Props = $props()
</script>

<section
  {id}
  class={`scroll-mt-28 ${showBorder ? 'border-t border-border-card py-12 first:border-t-0 first:pt-0 md:py-16' : 'py-5 md:py-6'}`}
>
  {#if eyebrow}
    <p class="mt-3 font-display text-headline-lg font-bold leading-tight text-primary">
      {#if number !== undefined}
        <span aria-hidden="true">{number}. </span>
      {/if}
      {@html eyebrow}
    </p>
  {/if}
  {#if intro}
    <GuideParagraph class="mt-3"> {@html intro} </GuideParagraph>
  {/if}
  {#if actionLabel}
    <p
      class="mt-6 font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {#if typeof actionLabel === 'string'}
        {@html actionLabel}
      {:else}
        <GuideProgressMarker {...actionLabel} />
      {/if}
    </p>
  {/if}
  {#if title}
    <GuideTextHeader as="h2" {title} class={actionLabel ? 'mt-1' : 'mt-8'}>
      {#if step}
        <span class="ml-3 font-body text-label-md font-semibold text-secondary"
          >[{step}]</span
        >
      {/if}
    </GuideTextHeader>
  {/if}
  {#if description}
    <GuideParagraph class={actionLabel ? 'mt-2' : 'mt-4'}>
      {@html description}
    </GuideParagraph>
  {/if}
  <div>{@render children?.()}</div>
</section>
