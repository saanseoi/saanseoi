<script lang="ts">
import type { DiffSummary } from '../../../../diff'
import {
  formatReleaseVersion,
  orderComparisonReleases,
} from '../../../../release-order'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import { IconButton } from '../../../primitives/iconButton'
import PanelHeader from '../panelHeader.svelte'

let {
  comparisonVersion,
  compact = false,
  onClose,
  primaryVersion,
  summary,
  text,
  theme,
  versions,
}: {
  comparisonVersion: string
  compact?: boolean
  onClose?: () => void
  primaryVersion: string
  summary: DiffSummary | null
  text: ViewerText
  theme: AppState['theme']
  versions: string[]
} = $props()

const comparisonOrder = $derived(
  orderComparisonReleases(primaryVersion, comparisonVersion, versions),
)
</script>

<div class="grid gap-2">
  <PanelHeader
    alignmentClass={compact ? 'items-center' : 'items-start'}
    eyebrow={text.comparisonView}
    title={text.labels}
  >
    <div class="flex items-center gap-2">
      <span
        class="rounded-full bg-(--bar-control-background) px-2 py-1 text-[10px] font-semibold text-(--bar-muted)"
      >
        {summary?.labelChanges.length ?? 0}
        {text.labelChanges.toLowerCase()}
      </span>
      {#if compact && onClose}
        <IconButton icon="close" label={text.close} onclick={onClose} {theme} />
      {/if}
    </div>
  </PanelHeader>
  <div class="flex items-center gap-1.5 text-[11px] font-semibold">
    <span class="rounded-[4px] bg-(--bar-control-background) px-1.5 py-1">
      {formatReleaseVersion(
        comparisonOrder.oldest === 'primary' ? primaryVersion : comparisonVersion,
        text.latest,
      )}
    </span>
    <span aria-hidden="true" class="text-(--bar-muted)">→</span>
    <span class="rounded-[4px] bg-(--bar-control-background) px-1.5 py-1">
      {formatReleaseVersion(
        comparisonOrder.newest === 'primary' ? primaryVersion : comparisonVersion,
        text.latest,
      )}
    </span>
  </div>
  <p class="m-0 w-full text-[11px] leading-[1.35] text-(--bar-muted)">
    {text.diffDescription}
  </p>
</div>
