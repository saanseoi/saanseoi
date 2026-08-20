<script lang="ts">
import { slide } from 'svelte/transition'

import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditBulkSections from './releaseAuditBulkSections.svelte'
import ReleaseAuditEmptyState from './releaseAuditEmptyState.svelte'
import ReleaseAuditRecordSections from './releaseAuditRecordSections.svelte'
import type {
  AuditBulkRule,
  AuditRowPresentation,
  AuditSection,
} from './releaseAudit.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
type Props = {
  bulkActions: AuditBulkRule[]
  analyticsSurface: ReleaseAnalyticsSurface
  copiedEvidenceId: string | null
  evidenceTransitionName: (id: string) => string
  expandedEvidenceId: string | null
  formatAction: (action: string) => { issue: string; outcome: string }
  formatNumber: (value: number) => string
  locale: string
  onCopy: (id: string, evidence: unknown) => void
  onFullscreen: (id: string, evidence: unknown) => void
  onToggle: (id: string) => void
  presentRow: (
    action: string,
    evidence: unknown,
    summary: string,
  ) => AuditRowPresentation
  sections: AuditSection[]
  showBulkActions: boolean
  visibleActionCount: number
  visibleBulkSections: AuditBulkRule[]
}

let props: Props = $props()
</script>

{#if props.showBulkActions}
  <div transition:slide={{ duration: 200 }}>
    <ReleaseAuditBulkSections rules={props.visibleBulkSections} locale={props.locale} />
  </div>
{/if}

<ReleaseAuditRecordSections
  analyticsSurface={props.analyticsSurface}
  copiedEvidenceId={props.copiedEvidenceId}
  evidenceTransitionName={props.evidenceTransitionName}
  expandedEvidenceId={props.expandedEvidenceId}
  formatAction={props.formatAction}
  formatNumber={props.formatNumber}
  onCopy={props.onCopy}
  onFullscreen={props.onFullscreen}
  onToggle={props.onToggle}
  presentRow={props.presentRow}
  sections={props.sections}
/>

{#if !props.sections.length && !props.visibleBulkSections.length}
  <ReleaseAuditEmptyState
    message={props.visibleActionCount || props.bulkActions.length ? m.source_audit_no_matches() : m.source_audit_none()}
  />
{/if}
