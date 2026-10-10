<script lang="ts">
import type { Json } from '@repo/core/provenance'
import { auditLabel } from './auditDivisionPresentation'
import BoundarySource from './auditBoundarySource.svelte'
let { definition }: { definition: Record<string, Json> } = $props()
</script>
<div class="space-y-3">
  <p>
    Source geometry:
    <span class="font-medium"
      >{auditLabel(String(definition.decision ?? 'Not reviewed'))}</span
    >
  </p>
  {#if definition.decision === 'rejected'}
    <p class="opacity-65">
      {String(
        definition.note ||
          auditLabel(
            String(definition.rejectionCode ?? 'No rejection reason recorded.'),
          ),
      )}
    </p>
  {/if}
  {#if definition.selectedSourceRecordId}
    <BoundarySource
      definition={{ sourceRecordId: definition.selectedSourceRecordId }}
    />
  {/if}
</div>
