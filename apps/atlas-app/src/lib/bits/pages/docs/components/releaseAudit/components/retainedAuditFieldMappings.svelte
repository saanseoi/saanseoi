<script lang="ts">
import type { Json } from '@repo/core/provenance'
let { fields }: { fields: Json[] } = $props()
const object = (v: Json | undefined) =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {}
let rows = $derived(
  fields.map(value => {
    const field = object(value)
    return { ...field, ...object(field.metadata) }
  }),
)
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-sm">
    <thead class="border-b border-current/20 text-xs uppercase opacity-60">
      <tr>
        <th class="p-2">Source field</th>
        <th class="p-2">Canonical field</th>
        <th class="p-2">Measure / unit</th>
        <th class="p-2">Dimensions</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class="border-b border-current/10 align-top">
          <td class="p-2 font-mono">{String(row.sourceField ?? '—')}</td>
          <td class="p-2">{String(row.fieldName ?? '—')}</td>
          <td class="p-2">
            {String(row.measureCode ?? '—')}
            <span class="block opacity-60"
              >{String(row.unitCode ?? '—')}
              · {String(row.aggregation ?? '—')}</span
            >
          </td>
          <td class="p-2">
            {Object.entries(object(row.dimensions)).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'All'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
