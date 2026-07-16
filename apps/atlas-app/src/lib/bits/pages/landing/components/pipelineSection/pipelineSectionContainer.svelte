<script lang="ts">
import type { Snippet } from 'svelte'

type Props = { children?: Snippet; isActive: boolean; isRevealed: boolean }
let { children, isActive, isRevealed }: Props = $props()
</script>

<div
  class:landing-pipeline-active={isActive}
  class:landing-pipeline-revealed={isRevealed}
  class="landing-pipeline overflow-clip scroll-mt-18"
>
  <div
    class="pipeline-panel mx-auto flex min-h-[max(42.75rem,calc(100svh-4.5rem))] w-full max-w-(--spacing-container-max) flex-col justify-start px-6 pb-16 pt-[calc(clamp(2.25rem,5svh,3.5rem)+24px)] md:px-8 md:pb-20 md:pt-[calc(clamp(2.75rem,5.5svh,4rem)+24px)]"
  >
    {@render children?.()}
  </div>
</div>
