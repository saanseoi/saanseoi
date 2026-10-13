<script lang="ts">
let { label, mobile = false }: { label: string; mobile?: boolean } = $props()
</script>

<h3
  data-release-nav-api-heading
  class={`sticky top-0 z-20 m-0 shrink-0 font-mono text-label-sm font-semibold text-on-surface-variant ${mobile ? 'bg-surface-container-low px-6 py-2' : 'bg-surface px-1 pt-2 pb-1'}`}
>
  API {label}
</h3>
