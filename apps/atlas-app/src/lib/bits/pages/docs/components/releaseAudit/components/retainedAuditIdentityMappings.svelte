<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
import { auditDivisionCode } from '@repo/core/provenance/divisionCodes'
let { mappings }: { mappings: Json[] } = $props()
const object = (v: Json) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
</script>

<div class="overflow-x-auto">
  <table class="w-full table-fixed text-left text-sm [&_code]:[overflow-wrap:anywhere]">
    <thead class="border-b border-current/20 text-xs uppercase opacity-60">
      <tr>
        <th class="p-2">{m.source_audit_source_identity()}</th>
        <th class="p-2">{m.source_audit_source_code()}</th>
        <th class="p-2">{m.source_audit_division_code()}</th>
        <th class="p-2">{m.source_audit_canonical_identity()}</th>
      </tr>
    </thead>
    <tbody>
      {#each mappings as mapping}
        {@const row = object(mapping)}
        <tr class="border-b border-current/10">
          <td class="p-2">
            <code class="text-emerald-500">{String(row.externalId ?? '—')}</code>
          </td>
          <td class="p-2">
            <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              >{String(row.externalCode ?? '—')}</code
            >
          </td>
          <td class="p-2">
            <code
              class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              title={row.divisionCode ? m.source_audit_retained_division_code() : m.source_audit_current_division_code()}
              >{String(row.divisionCode ?? auditDivisionCode(String(row.canonicalId)) ?? m.source_audit_not_recorded())}</code
            >
          </td>
          <td class="p-2">
            <code class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              >{String(row.canonicalId ?? '—')}</code
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
