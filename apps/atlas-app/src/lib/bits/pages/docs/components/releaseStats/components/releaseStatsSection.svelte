<script lang="ts">
let {
  children,
  class: className = '',
}: { children: import('svelte').Snippet; class?: string } = $props()
</script>
<section
  class={`overflow-hidden rounded-lg border border-data-outline-variant/60 bg-data-surface-container-low ${className}`}
>
  {@render children()}
</section>
