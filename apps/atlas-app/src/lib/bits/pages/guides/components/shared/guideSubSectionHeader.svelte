<script lang="ts">
import type { Snippet } from 'svelte'

import GuideProgressMarker from './guideProgressMarker.svelte'
import GuideTextHeader from './guideTextHeader.svelte'

type Props = {
  actions?: Snippet
  eyebrow?: string
  id?: string
  requirement?: {
    current: number
    label: string
    total: number
  }
  title: string
}

let { actions, eyebrow, id, requirement, title }: Props = $props()
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
  <GuideTextHeader as="h3" {id} {title} />
  {#if actions}
    <div class="shrink-0">{@render actions()}</div>
  {/if}
</div>
