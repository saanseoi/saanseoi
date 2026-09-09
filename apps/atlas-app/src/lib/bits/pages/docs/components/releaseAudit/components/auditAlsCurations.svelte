<script lang="ts">
import { m } from '@repo/i18n/messages'
import type { Json } from '@repo/core/provenance'
import { alsAuditDecisions } from './auditAlsDecisions'
import { matchesAudit } from './auditSearch'
import Group from './auditAlsGroup.svelte'
let {
  groups,
  releaseId,
  query = '',
}: { groups: Record<string, Json>; releaseId: string; query?: string } = $props()
let decisions = $derived(alsAuditDecisions(groups, releaseId))
let types = $derived(
  [...new Set(decisions.map(d => d.kind))]
    .map(kind => {
      const all = decisions.filter(d => d.kind === kind)
      return {
        kind,
        all,
        visible: all.filter(d =>
          matchesAudit(query, d.title, d.description, d.context, d.raw),
        ),
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
  <Group all={group.all} visible={group.visible} {query} />
{/each}
