<script lang="ts">
import type { Snippet } from 'svelte'

import GuideProgressMarker from './guideProgressMarker.svelte'

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
  step,
  title,
}: Props = $props()
</script>

<section
  {id}
  class="scroll-mt-28 border-t border-border-card py-12 first:border-t-0 first:pt-0 md:py-16"
>
  {#if eyebrow}
    <p class="font-display text-headline-lg font-bold leading-tight text-primary">
      {#if number}
        <span aria-hidden="true">{number}. </span>
      {/if}
      {@html eyebrow}
    </p>
  {/if}
  {#if intro}
    <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
      {@html intro}
    </p>
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
    <h2
      class={`${actionLabel ? 'mt-1' : 'mt-8'} font-display text-headline-md font-bold text-primary`}
    >
      {@html title}
      {#if step}
        <span class="ml-3 font-body text-label-md font-semibold text-secondary"
          >[{step}]</span
        >
      {/if}
    </h2>
  {/if}
  {#if description}
    <p
      class={`${actionLabel ? 'mt-2' : 'mt-4'} max-w-3xl font-body text-body-md leading-7 text-foreground-alt`}
    >
      {@html description}
    </p>
  {/if}
  <div>{@render children?.()}</div>
</section>
