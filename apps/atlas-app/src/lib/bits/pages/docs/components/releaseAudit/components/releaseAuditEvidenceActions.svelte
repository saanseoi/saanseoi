<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'

import { m } from '#lib/bits/internal/i18n.js'
import type { ReleaseAnalyticsSurface } from '../../releaseLinks/components/releaseLinks.types.js'

type Props = {
  copied: boolean
  analyticsSurface: ReleaseAnalyticsSurface
  evidence: unknown
  evidenceId: string | null
  onCopy: (id: string, evidence: unknown) => void | Promise<void>
  onFullscreen?: (id: string, evidence: unknown) => void
}

let { analyticsSurface, copied, evidence, evidenceId, onCopy, onFullscreen }: Props =
  $props()
</script>

<div class="flex items-center gap-1">
  <button
    class="inline-flex size-8 items-center justify-center rounded-full text-data-primary transition hover:bg-data-surface-container-high hover:text-secondary"
    type="button"
    aria-label={m.source_audit_copy_evidence_json()}
    title={m.source_audit_copy_evidence_json()}
    disabled={!evidenceId}
    onclick={() => {
      if (!evidenceId) return
      trackClientProductUsage({ event: 'client.copy_evidence_json', surface: analyticsSurface, entityType: 'action', entityId: 'copy' })
      void Promise.resolve(onCopy(evidenceId, evidence)).catch(() => {
        trackClientProductUsage({ event: 'client.copy_evidence_json', surface: analyticsSurface, entityType: 'action', entityId: 'copy', outcome: 'failure' })
      })
    }}
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
      onclick={() => {
        trackClientProductUsage({ event: 'client.evidence_fullscreen', surface: analyticsSurface, entityType: 'action', entityId: 'open' })
        onFullscreen(evidenceId, evidence)
      }}
    >
      <Icon icon="ion:expand-outline" class="size-4" aria-hidden="true" />
    </button>
  {/if}
</div>
