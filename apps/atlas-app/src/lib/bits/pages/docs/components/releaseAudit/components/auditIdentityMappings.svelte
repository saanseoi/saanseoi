<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { Json } from '@repo/core/provenance'
import { auditDivisionCode } from '@repo/core/provenance/divisionCodes'
let { mappings }: { mappings: Json[] } = $props()
const displayId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? `${value.slice(0, 8)}…${value.slice(-8)}`
    : value
const object = (v: Json) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
</script>

<div class="contents">
  <table
    class="w-full table-fixed border-separate border-spacing-0 text-left text-sm [&_code]:wrap-anywhere"
  >
    <thead
      class="sticky top-0 z-10 bg-background [&_th]:border-b [&_th]:border-current/20 text-xs uppercase [&_th]:text-foreground/60"
    >
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
        <tr class="[&_td]:border-b [&_td]:border-current/10">
          <td class="p-2">
            <code title={String(row.externalId ?? '—')} class="text-emerald-500"
              >{displayId(String(row.externalId ?? '—'))}</code
            >
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
            <code
              class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500"
              title={String(row.canonicalId ?? '—')}
              >{displayId(String(row.canonicalId ?? '—'))}</code
            >
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
