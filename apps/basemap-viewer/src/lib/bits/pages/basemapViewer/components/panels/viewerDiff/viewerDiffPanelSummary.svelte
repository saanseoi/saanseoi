<script lang="ts">
import type { DiffSummary } from '../../../../../../diff'
import {
  formatReleaseVersion,
  orderComparisonReleases,
} from '../../../../../../release-order'
import type { ViewerText } from '../../../i18n'
import PanelHeader from '../panelHeader.svelte'

let {
  comparisonVersion,
  primaryVersion,
  summary,
  text,
  versions,
}: {
  comparisonVersion: string
  primaryVersion: string
  summary: DiffSummary | null
  text: ViewerText
  versions: string[]
} = $props()

const comparisonOrder = $derived(
  orderComparisonReleases(primaryVersion, comparisonVersion, versions),
)
</script>

<div class="grid gap-2 border-b border-(--bar-divider) pb-2.5">
  <PanelHeader eyebrow={text.comparisonView} title={text.diff}>
    <span
      class="rounded-full bg-(--bar-control-background) px-2 py-1 text-[10px] font-semibold text-(--bar-muted)"
    >
      {summary?.labelChanges.length ?? 0}
      {text.labelChanges.toLowerCase()}
    </span>
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
  <p class="m-0 max-w-[300px] text-[11px] leading-[1.35] text-(--bar-muted)">
    {text.diffDescription}
  </p>
</div>
