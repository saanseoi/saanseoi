<script lang="ts">
import FeatureSectionCardAnimationDive from './featureSectionCardAnimationDive.svelte'
import FeatureSectionCardAnimationGrid from './featureSectionCardAnimationGrid.svelte'
import FeatureSectionCardAnimationMatrix from './featureSectionCardAnimationMatrix.svelte'
import FeatureSectionCardAnimationSourceTree from './featureSectionCardAnimationSourceTree.svelte'
import type { FeatureSectionAnimation } from './featureSectionTypes'

type Props = { animation: FeatureSectionAnimation }
let { animation }: Props = $props()
</script>

<span
  class="principle-animation relative mb-5 block h-42 overflow-hidden rounded-[.65rem] opacity-[.94]"
  aria-hidden="true"
>
  {#if animation === 'ticker'}
    <FeatureSectionCardAnimationMatrix />
  {:else if animation === 'growth'}
    <FeatureSectionCardAnimationDive />
  {:else if animation === 'provenance'}
    <FeatureSectionCardAnimationSourceTree />
  {:else}
    <FeatureSectionCardAnimationGrid />
  {/if}
</span>
