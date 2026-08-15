<script lang="ts">
import Icon from '@iconify/svelte'

import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  copied: boolean
  evidence: unknown
  evidenceId: string | null
  onCopy: (id: string, evidence: unknown) => void
  onFullscreen?: (id: string, evidence: unknown) => void
}

let { copied, evidence, evidenceId, onCopy, onFullscreen }: Props = $props()
</script>

<div class="flex items-center gap-1">
  <button
    class="inline-flex size-8 items-center justify-center rounded-full text-data-primary transition hover:bg-data-surface-container-high hover:text-secondary"
    type="button"
    aria-label={m.source_audit_copy_evidence_json()}
    title={m.source_audit_copy_evidence_json()}
    disabled={!evidenceId}
    onclick={() => evidenceId && onCopy(evidenceId, evidence)}
  >
    <Icon
      icon={copied ? 'ion:checkmark-outline' : 'ion:copy-outline'}
      class="size-4"
      aria-hidden="true"
    />
  </button>
  {#if onFullscreen && evidenceId}
    <button
      class="inline-flex size-8 items-center justify-center rounded-full text-data-primary transition hover:bg-data-surface-container-high hover:text-secondary"
      type="button"
      aria-label={m.source_audit_view_evidence_fullscreen()}
      title={m.source_audit_view_evidence_fullscreen()}
      onclick={() => onFullscreen(evidenceId, evidence)}
    >
      <Icon icon="ion:expand-outline" class="size-4" aria-hidden="true" />
    </button>
  {/if}
</div>
