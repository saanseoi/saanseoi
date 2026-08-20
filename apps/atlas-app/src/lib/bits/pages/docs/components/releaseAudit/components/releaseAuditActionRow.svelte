<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditCardRow from './releaseAuditCardRow.svelte'
import ReleaseAuditEvidenceActions from './releaseAuditEvidenceActions.svelte'
import ReleaseAuditJsonEvidence from './releaseAuditJsonEvidence.svelte'
import type { AuditAction, AuditRowPresentation } from './releaseAudit.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'
type Props = {
  copied: boolean
  analyticsSurface: ReleaseAnalyticsSurface
  expanded: boolean
  onCopy: (id: string, evidence: unknown) => void
  onFullscreen: (id: string, evidence: unknown) => void
  onToggle: (id: string) => void
  presentation: AuditRowPresentation
  row: Pick<AuditAction, 'evidence' | 'id' | 'sourceReleaseCode'>
  transitionName: string
}

let {
  copied,
  analyticsSurface,
  expanded,
  onCopy,
  onFullscreen,
  onToggle,
  presentation,
  row,
  transitionName,
}: Props = $props()
let hasRight = $derived(
  Boolean(
    presentation.rightItems || presentation.rightLabel || presentation.rightValue,
  ),
)
</script>

{#snippet summary()}
  <div class="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
    <div class={`min-w-0 ${hasRight ? '' : 'sm:col-span-2'}`}>
      {#if presentation.leftLabel}
        <p
          class="font-mono text-caption font-medium tracking-[0.06em] text-foreground-alt/75"
        >
          {presentation.leftLabel}
        </p>
      {/if}
      <p
        class="mt-1 wrap-break-word font-mono text-label-md font-semibold text-data-primary"
      >
        {presentation.leftValue}
      </p>
      {#if row.sourceReleaseCode}
        <p class="mt-2 font-mono text-caption text-foreground-alt">
          {m.reference_source_release()}: {row.sourceReleaseCode}
        </p>
      {/if}
    </div>
    {#if presentation.rightItems}
      <div
        class="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3 text-left sm:justify-end sm:text-right"
      >
        {#each presentation.rightItems as item}
          <div class="min-w-0">
            <p
              class="font-mono text-caption font-medium tracking-[0.06em] text-foreground-alt/75"
            >
              {item.label}
            </p>
            <p class="mt-1 font-mono text-label-md font-semibold text-primary">
              {item.value}
            </p>
          </div>
        {/each}
      </div>
    {:else if hasRight}
      <div class="min-w-0 text-left sm:text-right">
        {#if presentation.rightLabel}
          <p
            class="font-mono text-caption font-medium tracking-[0.06em] text-foreground-alt/75"
          >
            {presentation.rightLabel}
          </p>
        {/if}
        {#if presentation.rightValue}
          <p
            class="mt-1 truncate font-mono text-label-md font-semibold text-primary"
            title={presentation.rightTitle}
          >
            {presentation.rightValue}
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet details()}
  {#if expanded}
    <div
      class="relative rounded-default border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 pb-3 pt-2"
    >
      <div
        class="absolute top-2 right-5 z-10 rounded-full border border-data-outline-variant/60 bg-data-surface-container-low shadow-popover"
      >
        <ReleaseAuditEvidenceActions
          {analyticsSurface}
          {copied}
          evidence={row.evidence}
          evidenceId={row.id}
          {onCopy}
          {onFullscreen}
        />
      </div>
      <div class="-mr-1 max-h-96 max-w-[160ch] overflow-auto pr-20">
        <ReleaseAuditJsonEvidence
          evidence={row.evidence}
          viewTransitionName={transitionName}
        />
      </div>
    </div>
  {/if}
{/snippet}

<ReleaseAuditCardRow
  {details}
  {expanded}
  label={m.source_audit_toggle_evidence_record()}
  onToggle={() => onToggle(row.id)}
>
  {@render summary()}
</ReleaseAuditCardRow>
