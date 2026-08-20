<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditActionRow from './releaseAuditActionRow.svelte'
import ReleaseAuditCard from './releaseAuditCard.svelte'
import ReleaseAuditCardHeader from './releaseAuditCardHeader.svelte'
import type { AuditRowPresentation, AuditSection } from './releaseAudit.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
type Props = {
  copiedEvidenceId: string | null
  analyticsSurface: ReleaseAnalyticsSurface
  evidenceTransitionName: (id: string) => string
  expandedEvidenceId: string | null
  formatAction: (action: string) => { issue: string; outcome: string }
  formatNumber: (value: number) => string
  onCopy: (id: string, evidence: unknown) => void
  onFullscreen: (id: string, evidence: unknown) => void
  onToggle: (id: string) => void
  presentRow: (
    action: string,
    evidence: unknown,
    summary: string,
  ) => AuditRowPresentation
  sections: AuditSection[]
}

let {
  copiedEvidenceId,
  analyticsSurface,
  evidenceTransitionName,
  expandedEvidenceId,
  formatAction,
  formatNumber,
  onCopy,
  onFullscreen,
  onToggle,
  presentRow,
  sections,
}: Props = $props()
</script>

{#if sections.length}
  <div class="mt-6 grid gap-6">
    {#each sections as section}
      {@const action = formatAction(section.action)}
      <ReleaseAuditCard>
        <ReleaseAuditCardHeader>
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class={`size-2 rounded-full ${section.mode === 'manual' ? 'bg-data-warning' : 'bg-data-success'}`}
                ></span>
                <p
                  class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
                >
                  {m.source_audit_record_action()}
                  •
                  {section.mode === 'automatic' ? m.source_audit_mode_automatic() : m.source_audit_mode_manual()}
                </p>
              </div>
              <h2
                id={section.id}
                class="mt-1 min-w-0 font-display text-title-md font-bold text-primary"
              >
                {action.issue}
              </h2>
            </div>
            <div class="justify-self-end text-right">
              <p class="font-mono text-label-md font-bold tabular-nums text-primary">
                {formatNumber(section.rows.length)}
                / {formatNumber(section.totalCount)}
              </p>
              <p class="mt-1 font-body text-label-md text-foreground-alt">
                <span
                  class="text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt/70"
                  >{m.source_audit_decision()}</span
                >
                <span class="ml-2 font-semibold text-primary">{action.outcome}</span>
              </p>
            </div>
          </div>
        </ReleaseAuditCardHeader>
        <div class="divide-y divide-data-outline-variant/60">
          {#each section.rows as row}
            <ReleaseAuditActionRow
              {analyticsSurface}
              copied={copiedEvidenceId === row.id}
              expanded={expandedEvidenceId === row.id}
              {onCopy}
              {onFullscreen}
              {onToggle}
              presentation={presentRow(row.action, row.evidence, row.summary)}
              {row}
              transitionName={evidenceTransitionName(row.id)}
            />
          {/each}
        </div>
      </ReleaseAuditCard>
    {/each}
  </div>
{/if}
