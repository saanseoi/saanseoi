<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { BulkAudit } from '@repo/core/provenance'
import { getRetainedBulkFixture } from '#lib/registry/audit.remote.js'
import CopyRule from './auditCopyRule.svelte'
let {
  bulk,
  resourceReleaseId,
  hash,
}: { bulk: BulkAudit; resourceReleaseId: string; hash: string } = $props()
const referenceLabel = (type: string) =>
  type === 'cached-publisher-metadata'
    ? m.source_audit_patch_publisher_reference()
    : type === 'reviewed-hierarchy-reference'
      ? m.source_audit_patch_reviewed_reference()
      : m.source_audit_patch_reference()
</script>
<dl class="grid grid-cols-2 border-t border-current/10">
  {#each [
    [m.source_audit_patch_operation(), m.source_audit_patch_add()],
    [m.source_audit_patch_record(), m.source_audit_patch_china()],
    [m.source_audit_patch_before(), m.source_audit_patch_missing()],
    [m.source_audit_patch_after(), m.source_audit_patch_country_added()],
  ] as [label, value]}
    <div class="space-y-2 px-4 py-3 odd:border-r border-current/10">
      <dt class="text-xs uppercase opacity-45">{label}</dt>
      <dd>{value}</dd>
    </div>
  {/each}
</dl>
<div class="space-y-2 border-t border-current/10 px-4 py-3">
  <p class="text-xs uppercase opacity-45">{m.source_audit_patch_evidence()}</p>
  {#each bulk.fixtures as fixture, index}
    <div class="flex items-center justify-between gap-3">
      <p class="opacity-65">{referenceLabel(fixture.type)}</p>
      <CopyRule
        kind="fixture"
        getRule={() =>
          getRetainedBulkFixture({ resourceReleaseId, hash, bulkId: bulk.id, index })}
      />
    </div>
  {/each}
</div>
