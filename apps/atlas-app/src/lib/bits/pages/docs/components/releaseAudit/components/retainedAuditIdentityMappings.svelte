<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { mappings }: { mappings: Json[] } = $props()
const object = (v: Json) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-current/20 text-xs uppercase opacity-60">
      <tr>
        <th class="p-2">Source identity</th>
        <th class="p-2">Source code</th>
        <th class="p-2">Canonical identity</th>
      </tr>
    </thead>
    <tbody>
      {#each mappings as mapping}
        {@const row = object(mapping)}
        <tr class="border-b border-current/10">
          <td class="p-2 font-mono">{String(row.externalId ?? '—')}</td>
          <td class="p-2">{String(row.externalCode ?? '—')}</td>
          <td class="p-2 font-mono">{String(row.canonicalId ?? '—')}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
