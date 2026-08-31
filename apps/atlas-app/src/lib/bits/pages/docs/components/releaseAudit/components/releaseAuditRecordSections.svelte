<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import ReleaseAuditActionRow from './releaseAuditActionRow.svelte'
import ReleaseAuditCard from './releaseAuditCard.svelte'
import ReleaseAuditCardHeader from './releaseAuditCardHeader.svelte'
import type {
  AuditEvidenceCopyHandler,
  AuditRowPresentation,
  AuditSection,
} from './releaseAudit.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'

const COLLAPSE_THRESHOLD = 25
type Props = {
  copiedEvidenceId: string | null
  analyticsSurface: ReleaseAnalyticsSurface
  evidenceTransitionName: (id: string) => string
  expandedEvidenceId: string | null
  failedSectionActions: Set<string>
  formatAction: (action: string) => { issue: string; outcome: string }
  formatNumber: (value: number) => string
  onCopy: AuditEvidenceCopyHandler
  onFullscreen: (id: string, evidence: unknown) => void
  onLoadMore: (section: AuditSection) => Promise<void>
  onToggle: (id: string) => void
  presentRow: (
    action: string,
    evidence: unknown,
    summary: string,
  ) => AuditRowPresentation
  sections: AuditSection[]
  loadingSectionActions: Set<string>
}

let {
  copiedEvidenceId,
  analyticsSurface,
  evidenceTransitionName,
  expandedEvidenceId,
  failedSectionActions,
  formatAction,
  formatNumber,
  onCopy,
  onFullscreen,
  onLoadMore,
  onToggle,
  presentRow,
  sections,
  loadingSectionActions,
}: Props = $props()

let expandedSections = $state<Map<string, boolean>>(new Map())

const isSectionExpanded = (section: AuditSection) =>
  expandedSections.get(section.id) ?? section.rows.length <= COLLAPSE_THRESHOLD

const toggleSection = (section: AuditSection) => {
  expandedSections = new Map(expandedSections).set(
    section.id,
    !isSectionExpanded(section),
  )
}
</script>

{#if sections.length}
  <div class="mt-6 grid gap-6">
    {#each sections as section}
      {@const action = formatAction(section.action)}
      {@const expanded = isSectionExpanded(section)}
      {@const recordListId = `${section.id}-records`}
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
              {#if section.rows.length > COLLAPSE_THRESHOLD}
                <button
                  class="mt-3 inline-flex cursor-pointer items-center gap-1.5 font-body text-label-sm font-semibold text-data-primary transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary"
                  type="button"
                  aria-controls={recordListId}
                  aria-expanded={expanded}
                  onclick={() => toggleSection(section)}
                >
                  {expanded ? m.source_audit_collapse_records() : m.source_audit_expand_records()}
                  <Icon
                    icon="ion:chevron-down-outline"
                    class={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              {/if}
            </div>
          </div>
        </ReleaseAuditCardHeader>
        {#if expanded}
          <div id={recordListId} class="divide-y divide-data-outline-variant/60">
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
            {#if section.hasMore}
              <div class="flex flex-col items-center gap-2 px-4 py-4">
                <button
                  class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-default border border-data-outline-variant bg-data-surface-container-low px-4 py-2 font-body text-label-sm font-semibold text-data-primary transition hover:border-data-primary hover:bg-data-surface-container disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  disabled={loadingSectionActions.has(section.action)}
                  onclick={() => void onLoadMore(section)}
                >
                  {#if loadingSectionActions.has(section.action)}
                    <Icon
                      icon="ion:sync-outline"
                      class="size-4 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    {m.source_audit_loading_records()}
                  {:else}
                    {m.source_audit_load_more_records()}
                  {/if}
                </button>
                {#if failedSectionActions.has(section.action)}
                  <p class="font-body text-label-sm text-data-danger" role="alert">
                    {m.source_audit_load_records_error()}
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </ReleaseAuditCard>
    {/each}
  </div>
{/if}
