<script lang="ts">
import { bulkSectionHeadingId, type AuditBulkRule } from './releaseAuditBulkSections'

import ReleaseAuditCard from './releaseAuditCard.svelte'
import ReleaseAuditBulkSectionHeader from './releaseAuditBulkSectionHeader.svelte'
import ReleaseAuditBulkSectionMappings from './releaseAuditBulkSectionMappings.svelte'

type Props = { description?: string; rule: AuditBulkRule; title: string }

let { description, rule, title }: Props = $props()
</script>

<ReleaseAuditCard>
  <ReleaseAuditBulkSectionHeader
    {description}
    condition={rule.condition}
    headingId={bulkSectionHeadingId(rule)}
    sourceFieldPath={rule.sourceFieldPath}
    sourceReleaseCode={rule.sourceReleaseCode}
    targetFieldPath={rule.targetFieldPath}
    {title}
  />
  <ReleaseAuditBulkSectionMappings mappings={rule.mappings} />
</ReleaseAuditCard>
