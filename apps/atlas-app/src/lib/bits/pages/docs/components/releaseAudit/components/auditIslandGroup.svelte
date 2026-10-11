<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject, divisionAuditTitle } from './auditDivisionPresentation'
let {
  definition,
  members,
}: { definition: Record<string, Json>; members: Record<string, Json> } = $props()
const labels: Record<string, string> = {
  seedMemberIds: 'Seed members',
  include: 'Included members',
  exclude: 'Excluded members',
}
</script>

<div class="space-y-4">
  <p class="break-all text-xs opacity-60">
    Division ID: {String(definition.divisionId)}
  </p>
  {#each Object.entries(members) as [key, entries]}
    {#if Array.isArray(entries) && entries.length}
      <section class="space-y-2">
        <h5 class="text-xs opacity-60">{labels[key] ?? key}</h5>
        <ul class="space-y-1">
          {#each entries as entry}
            {@const member = auditObject(entry)}
            <li class="wrap-break-word" title={String(member.id)}>
              {divisionAuditTitle({ id: member.id, canonicalNames: member.names })}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</div>
