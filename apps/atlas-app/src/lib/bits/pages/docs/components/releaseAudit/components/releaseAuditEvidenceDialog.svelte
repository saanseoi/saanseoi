<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { Dialog } from 'bits-ui'

import { m } from '#lib/bits/internal/i18n.js'

import ReleaseAuditEvidenceActions from './releaseAuditEvidenceActions.svelte'
import ReleaseAuditJsonEvidence from './releaseAuditJsonEvidence.svelte'
import type { AuditEvidenceCopyHandler } from './releaseAudit.types'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'

type Props = {
  copiedEvidenceId: string | null
  analyticsSurface: ReleaseAnalyticsSurface
  evidence: unknown
  evidenceId: string | null
  onClose: () => void
  onCopy: AuditEvidenceCopyHandler
  open?: boolean
  transitionName?: string
}

let {
  copiedEvidenceId,
  analyticsSurface,
  evidence,
  evidenceId,
  onClose,
  onCopy,
  open = $bindable(false),
  transitionName,
}: Props = $props()
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-80 bg-black/60 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-90 flex h-[calc(100svh-2rem)] w-[calc(100vw-4rem)] max-w-[120ch] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-data-outline-variant/60 bg-data-surface-container-lowest shadow-popover focus:outline-none"
      onEscapeKeydown={event => {
        event.preventDefault()
        onClose()
      }}
      onInteractOutside={event => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        class="flex items-center justify-between gap-4 border-b border-data-outline-variant/60 px-5 py-4"
      >
        <Dialog.Title class="font-body text-label-md font-semibold text-primary"
          >{m.source_audit_evidence_record()}</Dialog.Title
        >
        <div class="flex items-center gap-1">
          <ReleaseAuditEvidenceActions
            {analyticsSurface}
            copied={copiedEvidenceId === evidenceId}
            {evidence}
            {evidenceId}
            {onCopy}
          />
          <button
            class="inline-flex size-8 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-primary"
            type="button"
            aria-label={m.source_audit_close_evidence_record()}
            onclick={onClose}
          >
            <Icon icon="ion:close-outline" class="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="overflow-auto p-5">
        <div class="mx-auto w-full max-w-[80ch]">
          <ReleaseAuditJsonEvidence {evidence} viewTransitionName={transitionName} />
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
