<script lang="ts">
import type { Snippet } from 'svelte'

import GuideCalloutEyebrow from './guideCalloutEyebrow.svelte'
import GuideSubSectionHeader from './guideSubSectionHeader.svelte'

type Props = {
  after?: Snippet
  before?: Snippet
  card: Snippet
  children?: Snippet
  eyebrow?: string
  title?: string
  width?: 'content' | 'short' | 'shortCard'
}

const widthClasses = {
  content: 'max-w-[58rem]',
  short: 'max-w-[48rem]',
  shortCard: 'max-w-[44.5rem]',
} as const

let {
  after,
  before,
  card,
  children,
  eyebrow,
  title,
  width = 'shortCard',
}: Props = $props()
</script>

<section class={`max-w-[58rem] space-y-5 pb-4`}>
  {#if title}
    <div>
      <GuideSubSectionHeader {eyebrow} {title} />
    </div>
  {:else if eyebrow}
    <GuideCalloutEyebrow text={eyebrow} />
  {/if}
  {@render children?.()}
  {@render before?.()}
  <div class={widthClasses[width]}>{@render card()}</div>
  {@render after?.()}
</section>
