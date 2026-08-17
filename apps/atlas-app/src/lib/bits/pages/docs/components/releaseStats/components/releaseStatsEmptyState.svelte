<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
let { label }: { label: string } = $props()
</script>
<div
  class="flex gap-3 border border-data-outline-variant/60 bg-data-surface-container-low p-4 font-body text-body-md text-foreground-alt"
>
  <Icon
    icon="proicons:chart-bar"
    class="mt-0.5 size-5 shrink-0 text-data-secondary"
    aria-hidden="true"
  />
  <p>{label}</p>
</div>
