<script lang="ts">
import type { Snippet } from 'svelte'

import GuideTextSubHeader from './guideTextSubHeader.svelte'

type Props = {
  children?: Snippet
  class?: string
  title?: string
}

let { children, class: className = '', title }: Props = $props()
</script>

<GuideTextSubHeader {title} class={`mt-[0.35rem] ${className}`}>
  {@render children?.()}
</GuideTextSubHeader>
