<script lang="ts">
import { getApiSnapshotChanges } from '#lib/registry/apiSnapshotChanges.remote.js'
import RecordChange from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChange.svelte'
import LoadingRows from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChangesSkeleton.svelte'
import {
  sourceRecordChangesCopy,
  type SourceChangeType,
} from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChanges.copy.js'
import Overview from './releaseStatsOverviewSection.svelte'
import { createReleaseStatsPresentation } from '../releaseStatsPresentation'
import type { ReleaseStatsCopy } from '../releaseStats.types'
import { untrack } from 'svelte'
import { Tooltip } from 'bits-ui'
let {
  resourceLabel,
  fromSnapshot,
  toSnapshot,
  type,
  onTypeChange,
  diff,
  locale,
  presentation,
}: {
  resourceLabel: string
  fromSnapshot?: string
  toSnapshot: string
  type?: SourceChangeType
  onTypeChange: (type?: SourceChangeType) => void
  diff: boolean
  locale: keyof typeof sourceRecordChangesCopy
  presentation: ReleaseStatsCopy
} = $props()
let offset = $state(0)
let rows = $state.raw<Awaited<ReturnType<typeof getApiSnapshotChanges>>['records']>([])
let failure = $state(false)
let pending = $derived(
  fromSnapshot
    ? getApiSnapshotChanges({ fromSnapshot, toSnapshot, offset, type })
    : null,
)
let copy = $derived(sourceRecordChangesCopy[locale])
let result = $derived(pending?.ready ? pending.current : undefined)
$effect(() => {
  if (!result) return
  const incomingIds = new Set(result.records.map(record => record.id))
  rows =
    offset === 0
      ? result.records
      : [
          ...untrack(() => rows).filter(row => !incomingIds.has(row.id)),
          ...result.records,
        ]
})
$effect(() => {
  let cancelled = false
  failure = false
  if (pending)
    void pending.catch(() => {
      if (!cancelled) failure = true
    })
  return () => {
    cancelled = true
  }
})
let overview = $derived(
  result
    ? createReleaseStatsPresentation({
        stats: [
          { category: 'records', measure: 'count', unit: 'count', value: result.total },
          ...Object.entries(result.counts).map(([key, value]) => ({
            category: 'changes',
            measure: `${key}_count`,
            unit: 'count',
            value,
          })),
        ],
        locale,
        copy: {
          ...presentation,
          labels: { ...presentation.labels, dataset: resourceLabel },
        },
      }).overview
    : undefined,
)
function observeEnd(node: HTMLElement) {
  const observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting) && result?.nextOffset != null)
        offset = result.nextOffset
    },
    { rootMargin: '300px 0px' },
  )
  observer.observe(node)
  return { destroy: () => observer.disconnect() }
}
</script>
<section
  class="space-y-2"
  aria-label={copy.changes}
  aria-busy={Boolean(pending && !pending.ready && !failure)}
>
  {#if overview}
    <Tooltip.Provider delayDuration={200}>
      <Overview
        {overview}
        labels={{ ...presentation.labels, dataset: resourceLabel }}
        onChangeSelect={onTypeChange}
        selectedType={type}
      />
    </Tooltip.Provider>
  {/if}
  {#each rows as record (record.id)}
    <RecordChange {...record} {diff} {locale} />
  {/each}
  {#if !fromSnapshot}
    <p class="text-body-md text-foreground-alt" role="status">{copy.noBaseline}</p>
  {:else if failure}
    <p class="text-body-md text-error" role="alert">{copy.error}</p>
    <button
      type="button"
      class="rounded border border-outline-variant px-4 py-2 text-label-sm"
      onclick={() => {
        failure = false
        const query = pending
        void query?.refresh().catch(() => {
          if (pending === query) failure = true
        })
      }}
    >
      {copy.retry}
    </button>
  {:else if pending && !pending.ready}
    <LoadingRows label={copy.loading} />
  {:else if !rows.length}
    <p class="text-body-md text-foreground-alt" role="status">{copy.empty}</p>
  {/if}
  {#if result?.nextOffset != null && pending?.ready}
    {#key offset}
      <div use:observeEnd class="h-px" aria-hidden="true"></div>
    {/key}
  {/if}
</section>
