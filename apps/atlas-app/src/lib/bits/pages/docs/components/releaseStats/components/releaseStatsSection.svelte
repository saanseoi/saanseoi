<script lang="ts">
let {
  children,
  id,
  class: className = '',
}: { children: import('svelte').Snippet; class?: string; id?: string } = $props()
</script>
<section
  data-release-nav-box
  {id}
  class={`overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low ${className}`}
>
  {@render children()}
</section>
