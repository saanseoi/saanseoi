<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditObject, divisionAuditTitle } from './auditDivisionPresentation'
let { definition, paths }: { definition: Record<string, Json>; paths: Json[] } =
  $props()
</script>

<div class="space-y-4">
  <p class="break-all text-xs opacity-60">
    Division ID: {String(definition.divisionId)}
  </p>
  {#each paths as path}
    {#if Array.isArray(path)}
      <ol class="flex flex-wrap items-center gap-2" aria-label="Hierarchy path">
        {#each path as item, index}
          {@const ancestor = auditObject(item)}
          <li class="flex items-center gap-2">
            {#if index}
              <span aria-hidden="true" class="opacity-40">→</span>
            {/if}
            <span title={String(ancestor.id)}
              >{divisionAuditTitle({
                id: ancestor.id,
                canonicalNames: ancestor.names,
              })}</span
            >
          </li>
        {/each}
      </ol>
    {/if}
  {/each}
</div>
