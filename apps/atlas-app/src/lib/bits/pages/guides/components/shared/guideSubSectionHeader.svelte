<script lang="ts">
import type { Snippet } from 'svelte'

import GuideProgressMarker from './guideProgressMarker.svelte'

type Props = {
  actions?: Snippet
  eyebrow?: string
  requirement?: {
    current: number
    label: string
    total: number
  }
  title: string
}

let { actions, eyebrow, requirement, title }: Props = $props()
</script>

{#if eyebrow || requirement}
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {#if requirement}
      <GuideProgressMarker {...requirement} />
    {:else if eyebrow}
      {@html eyebrow}
    {/if}
  </p>
{/if}
<div class="mt-1 flex flex-wrap items-center justify-between gap-3">
  <h3 class="font-display text-headline-md leading-tight font-bold text-primary">
    {@html title}
  </h3>
  {#if actions}
    <div class="shrink-0">{@render actions()}</div>
  {/if}
</div>
