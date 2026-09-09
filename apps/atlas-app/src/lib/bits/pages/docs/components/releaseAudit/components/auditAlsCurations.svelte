<script lang="ts">
import { m } from '@repo/i18n/messages'
import type { AlsSearchRow } from './auditFixtureCatalogue'
import { matchesAuditText } from './auditSearch'
import Group from './auditAlsGroup.svelte'
let {
  rows,
  releaseId,
  releaseCode,
  hash,
  query = '',
}: {
  rows: AlsSearchRow[]
  releaseId: string
  releaseCode: string
  hash: string
  query?: string
} = $props()
let types = $derived(
  [...new Set(rows.map(d => d.kind))]
    .map(kind => {
      const all = rows.filter(d => d.kind === kind)
      return {
        kind,
        all,
        visible: all.filter(d => matchesAuditText(query, d.text)),
      }
    })
    .filter(group => group.visible.length),
)
</script>

{#if types.length}
  <p class="px-2 text-xs leading-relaxed opacity-55">
    {m.source_audit_als_curations_scope()}
  </p>
{/if}
{#each types as group (group.kind)}
  <Group
    all={group.all}
    visible={group.visible}
    {query}
    {releaseId}
    {releaseCode}
    {hash}
  />
{/each}
