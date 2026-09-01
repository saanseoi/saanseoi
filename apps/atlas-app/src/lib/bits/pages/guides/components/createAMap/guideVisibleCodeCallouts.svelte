<script lang="ts">
import GuideInstructionCallout from './guideInstructionCallout.svelte'
import type { GuideCodeVisibleLine } from '../shared/guideCodeBlock.svelte'

type Callout = {
  description: string
  label: string
  line: number
  title: string
}

type Props = {
  callouts: Callout[]
  visibleLines: GuideCodeVisibleLine[]
}

let { callouts, visibleLines }: Props = $props()
let activeCallout = $derived(
  callouts.find(callout => visibleLines.some(visible => visible.line === callout.line)),
)
let activeLine = $derived(
  activeCallout
    ? visibleLines.find(visible => visible.line === activeCallout.line)
    : undefined,
)
</script>

<aside class="relative h-full" aria-live="polite">
  {#each callouts as callout}
    {#if callout.line === activeCallout?.line}
      <div class="absolute inset-x-0" style:top={`${activeLine?.top ?? 0}px`}>
        <GuideInstructionCallout
          label={callout.label}
          title={callout.title}
          description={callout.description}
        />
      </div>
    {/if}
  {/each}
</aside>
