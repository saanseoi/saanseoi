<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
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
  <table
    class="w-full table-fixed text-left text-sm [&_td]:wrap-break-word [&_code]:wrap-anywhere"
  >
    <thead class="border-b border-current/20 text-xs uppercase opacity-60">
      <tr>
        <th class="w-[18%] p-2">{m.source_audit_source_field()}</th>
        <th class="w-[32%] p-2">{m.source_audit_canonical_field()}</th>
        <th class="w-[23%] p-2">{m.source_audit_measure_unit()}</th>
        <th class="w-[27%] p-2">{m.source_audit_dimensions()}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class="border-b border-current/10 align-top">
          <td class="p-2">
            <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              >{String(row.sourceField ?? '—')}</code
            >
          </td>
          <td class="p-2">
            <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              >{String(row.fieldName ?? '—')}</code
            >
          </td>
          <td class="p-2">
            <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              >{String(row.measureCode ?? '—')}</code
            >
            <span class="block opacity-60"
              ><code class="text-emerald-500">{String(row.unitCode ?? '—')}</code>
              ·
              <code class="text-emerald-500"
                >{String(row.aggregation ?? '—')}</code
              ></span
            >
          </td>
          <td class="p-2">
            {#each Object.entries(object(row.dimensions)) as [key, value]}
              <span class="mr-2 inline-block"
                >{key}:
                <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
                  >{String(value)}</code
                ></span
              >
            {:else}
              {m.source_audit_all()}
            {/each}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
