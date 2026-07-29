<script lang="ts">
import type { Snippet } from 'svelte'

type Props = { children?: Snippet; element?: HTMLElement }

let { children, element = $bindable<HTMLElement>() }: Props = $props()
</script>

<div
  bind:this={element}
  data-release-nav-content-body
  role="tabpanel"
  class="scroll-mt-24 pt-4 lg:scroll-mt-[120px] lg:pt-0"
>
  {@render children?.()}
</div>
