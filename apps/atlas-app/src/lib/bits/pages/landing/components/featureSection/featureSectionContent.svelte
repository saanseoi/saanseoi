<script lang="ts">
import { onMount } from 'svelte'

import FeatureSectionDeck from './featureSectionDeck.svelte'
import FeatureSectionHeader from './featureSectionHeader.svelte'

let featureSectionElement = $state<HTMLElement>()
let isFeatureSectionActive = $state(false)
let isFeatureSectionRevealed = $state(false)

onMount(() => {
  if (!featureSectionElement) return

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return
      isFeatureSectionActive = entry.isIntersecting
      if (entry.isIntersecting) isFeatureSectionRevealed = true
    },
    { rootMargin: '20% 0px', threshold: 0.01 },
  )
  observer.observe(featureSectionElement)
  return () => observer.disconnect()
})
</script>

<div
  bind:this={featureSectionElement}
  class={`landing-feature-section-content ${
    isFeatureSectionActive
      ? ''
      : '[&_.principle-animation_*]:paused [&_.principle-animation:before]:paused [&_.principle-animation:after]:paused'
  }`}
>
  <div
    class="feature-section-panel mx-auto flex min-h-[max(42.75rem,calc(100svh-4.5rem))] w-full max-w-(--spacing-container-max) flex-col justify-start px-6 pb-16 pt-[calc(clamp(2.25rem,5svh,3.5rem)+24px)] md:px-8 md:pb-20 md:pt-[calc(clamp(2.75rem,5.5svh,4rem)+24px)]"
  >
    <FeatureSectionHeader isRevealed={isFeatureSectionRevealed} />
    <FeatureSectionDeck isRevealed={isFeatureSectionRevealed} />
  </div>
</div>
