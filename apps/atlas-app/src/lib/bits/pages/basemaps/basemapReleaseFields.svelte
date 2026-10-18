<script lang="ts">
import type { ManifestField } from '#lib/registry/basemapRelease.js'
let { rows }: { rows: ManifestField[] } = $props()
</script>
<dl class="divide-y divide-outline-variant/60">
  {#each rows as row}
    <div class="grid gap-2 py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
      <dt class="font-body text-label-md text-foreground-alt">{row.label}</dt>
      <dd class="min-w-0 break-all font-mono text-sm text-primary">{row.value}</dd>
    </div>
  {/each}
</dl>
