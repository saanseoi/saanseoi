<script lang="ts">
let {
  children,
  element = $bindable<HTMLElement>(),
}: { children: import('svelte').Snippet; element?: HTMLElement } = $props()
</script>
<div
  bind:this={element}
  data-release-nav-content-body
  role="tabpanel"
  class="scroll-mt-24 pt-4 pb-[calc(100svh-10rem)] lg:scroll-mt-[120px] lg:pt-0"
>
  {@render children()}
</div>
