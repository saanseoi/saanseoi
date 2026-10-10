<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { definition }: { definition: Record<string, Json> } = $props()
let selected = $derived(String(definition.sourceRecordId ?? ''))
const source = (id: string) =>
  id.startsWith('PROTOMAPS:')
    ? 'Protomaps'
    : id.startsWith('OSM:')
      ? 'OpenStreetMap'
      : id.split(':')[0] || 'Source'
</script>
<div class="space-y-2">
  <p class="text-sm" title={selected}>
    Selected boundary source: <span class="font-medium">{source(selected)}</span>
  </p>
</div>
