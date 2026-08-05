<script lang="ts">
import type { ViewerDiagnostics } from '../../../../../diagnostics'
import type { TileWeightSummary } from '../../../../tile-weight'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import DefinitionItem from '../panelDefinitionItem.svelte'

let {
  diagnostics,
  locale,
  text,
}: {
  diagnostics: ViewerDiagnostics
  locale: AppState['locale']
  text: ViewerText
} = $props()

const comparison = $derived(
  diagnostics.comparison ? diagnostics.tileWeight.comparison : null,
)

const localeName: Record<AppState['locale'], string> = {
  en: 'en-GB',
  'zh-Hant': 'zh-Hant',
  'zh-Hans': 'zh-Hans',
}

function formatNumber(value: number | null): string {
  if (value === null) return text.unavailable
  return new Intl.NumberFormat(localeName[locale], { maximumFractionDigits: 1 }).format(
    value,
  )
}

function formatBytes(value: number | null): string {
  if (value === null) return text.unavailable
  if (value < 1024) return `${formatNumber(value)} B`
  if (value < 1024 * 1024) return `${formatNumber(value / 1024)} kB`
  return `${formatNumber(value / (1024 * 1024))} MB`
}

function formatMilliseconds(value: number | null): string {
  return value === null
    ? text.unavailable
    : `${formatNumber(value)} ${text.milliseconds}`
}

function tileLabel(summary: TileWeightSummary): string {
  const largest = summary.largestTile
  if (!largest) return text.unavailable
  return largest.tile ?? largest.url
}
</script>

<section class="grid gap-2 border-t border-(--bar-divider) pt-2">
  <div>
    <h3
      class="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-(--bar-muted)"
    >
      {text.tileWeight}
    </h3>
    <p class="mt-1 mb-0 text-[11px] leading-snug text-(--bar-muted)">
      {text.tileWeightExplanation}
    </p>
  </div>
  <dl
    class={`m-0 grid gap-x-2 gap-y-1 text-[11px] leading-tight ${comparison ? 'grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)_minmax(0,0.72fr)]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}
  >
    <dt></dt>
    <dd class="m-0 font-mono font-bold">{text.diagnosticPrimary}</dd>
    {#if comparison}
      <dd class="m-0 font-mono font-bold">{text.diagnosticComparison}</dd>
    {/if}
    {#each [
      {
        label: text.tileWeightRequests,
        primary: formatNumber(diagnostics.tileWeight.primary.tileRequests),
        comparison: comparison && formatNumber(comparison.tileRequests),
      },
      {
        label: text.tileWeightCompleted,
        primary: formatNumber(diagnostics.tileWeight.primary.completedLoads),
        comparison: comparison && formatNumber(comparison.completedLoads),
      },
      {
        label: text.tileWeightFailed,
        primary: formatNumber(diagnostics.tileWeight.primary.failedLoads),
        comparison: comparison && formatNumber(comparison.failedLoads),
      },
      {
        label: text.tileWeightBasemapRequests,
        primary: formatNumber(diagnostics.tileWeight.primary.normalBasemapRequests),
        comparison: comparison && formatNumber(comparison.normalBasemapRequests),
      },
      {
        label: text.tileWeightLabelRequests,
        primary: formatNumber(diagnostics.tileWeight.primary.labelOnlyRequests),
        comparison: comparison && formatNumber(comparison.labelOnlyRequests),
      },
      {
        label: text.tileWeightTransfer,
        primary: formatBytes(diagnostics.tileWeight.primary.totalTransferBytes),
        comparison: comparison && formatBytes(comparison.totalTransferBytes),
      },
      {
        label: text.tileWeightEncoded,
        primary: formatBytes(diagnostics.tileWeight.primary.totalEncodedBodyBytes),
        comparison: comparison && formatBytes(comparison.totalEncodedBodyBytes),
      },
      {
        label: text.tileWeightDecoded,
        primary: formatBytes(diagnostics.tileWeight.primary.totalDecodedBodyBytes),
        comparison: comparison && formatBytes(comparison.totalDecodedBodyBytes),
      },
      {
        label: text.tileWeightDurationMean,
        primary: formatMilliseconds(diagnostics.tileWeight.primary.meanDurationMs),
        comparison: comparison && formatMilliseconds(comparison.meanDurationMs),
      },
      {
        label: text.tileWeightDurationP95,
        primary: formatMilliseconds(diagnostics.tileWeight.primary.p95DurationMs),
        comparison: comparison && formatMilliseconds(comparison.p95DurationMs),
      },
      {
        label: text.tileWeightTransferMean,
        primary: formatBytes(diagnostics.tileWeight.primary.meanTransferBytes),
        comparison: comparison && formatBytes(comparison.meanTransferBytes),
      },
      {
        label: text.tileWeightTransferP95,
        primary: formatBytes(diagnostics.tileWeight.primary.p95TransferBytes),
        comparison: comparison && formatBytes(comparison.p95TransferBytes),
      },
    ] as metric}
      <DefinitionItem label={metric.label} valueClass="font-mono font-medium">
        {metric.primary}
      </DefinitionItem>
      {#if comparison}
        <dd class="m-0 font-mono font-medium">{metric.comparison}</dd>
      {/if}
    {/each}
    <dt class="border-t border-(--bar-divider) pt-1.5 text-(--bar-muted)">
      {text.tileWeightLargest}
    </dt>
    <dd class="m-0 border-t border-(--bar-divider) pt-1.5 font-mono font-medium">
      {#if diagnostics.tileWeight.primary.largestTile}
        <span
          class="block truncate"
          title={diagnostics.tileWeight.primary.largestTile.url}
        >
          {tileLabel(diagnostics.tileWeight.primary)}
        </span>
        <span class="block text-(--bar-muted)">
          {diagnostics.tileWeight.primary.largestTile.source}
          ·
          {formatBytes(diagnostics.tileWeight.primary.largestTile.transferBytes)}
          {text.tileWeightTransferShort}
          ·
          {formatBytes(diagnostics.tileWeight.primary.largestTile.decodedBodyBytes)}
          {text.tileWeightDecodedShort}
          ·
          {formatMilliseconds(diagnostics.tileWeight.primary.largestTile.durationMs)}
        </span>
      {:else}
        {text.unavailable}
      {/if}
    </dd>
    {#if comparison}
      <dd class="m-0 border-t border-(--bar-divider) pt-1.5 font-mono font-medium">
        {#if comparison.largestTile}
          <span class="block truncate" title={comparison.largestTile.url}>
            {tileLabel(comparison)}
          </span>
          <span class="block text-(--bar-muted)">
            {comparison.largestTile.source}
            · {formatBytes(comparison.largestTile.transferBytes)}
            {text.tileWeightTransferShort}
            · {formatBytes(comparison.largestTile.decodedBodyBytes)}
            {text.tileWeightDecodedShort}
            · {formatMilliseconds(comparison.largestTile.durationMs)}
          </span>
        {:else}
          {text.unavailable}
        {/if}
      </dd>
    {/if}
  </dl>
</section>
