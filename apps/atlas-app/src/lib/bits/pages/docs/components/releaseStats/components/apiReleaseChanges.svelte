<script lang="ts">
import { selectSnapshotChangeStats } from '#lib/registry/apiSnapshotChangeStats.js'
import { getApiSnapshotChanges } from '#lib/registry/apiSnapshotChanges.remote.js'
import RecordChange from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChange.svelte'
import EmptyState from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChangesEmptyState.svelte'
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
  baselineLoading = false,
  statistics,
  resourceType,
  variant,
  primary,
  fromSnapshot,
  toSnapshot,
  comparisons,
  type,
  onTypeChange,
  diff,
  locale,
  presentation,
}: {
  resourceLabel: string
  baselineLoading?: boolean
  statistics: Parameters<typeof selectSnapshotChangeStats>[0]
  resourceType: string
  variant?: string
  primary: boolean
  fromSnapshot?: string
  toSnapshot: string
  comparisons?: Array<{ fromSnapshot?: string; toSnapshot: string }>
  type?: SourceChangeType
  onTypeChange: (type?: SourceChangeType) => void
  diff: boolean
  locale: keyof typeof sourceRecordChangesCopy
  presentation: ReleaseStatsCopy
} = $props()
type Records = Awaited<ReturnType<typeof getApiSnapshotChanges>>['records']
let offsets = $state<Record<string, number>>({})
let pages = $state.raw<Record<string, Records>>({})
let failures = $state<Record<string, boolean>>({})
let inputs = $derived(comparisons ?? [{ fromSnapshot, toSnapshot }])
let states = $derived(
  inputs.map(input => {
    const key = `${input.fromSnapshot ?? ''}:${input.toSnapshot}`
    const offset = offsets[key] ?? 0
    const pending =
      input.fromSnapshot && input.fromSnapshot !== input.toSnapshot
        ? getApiSnapshotChanges({
            fromSnapshot: input.fromSnapshot,
            toSnapshot: input.toSnapshot,
            offset,
            type,
          })
        : null
    return {
      key,
      offset,
      pending,
      result: pending?.ready ? pending.current : undefined,
    }
  }),
)
let rows = $derived(
  Object.entries(pages)
    .filter(([key]) => states.some(state => state.key === key))
    .flatMap(([comparison, records]) => records.map(record => ({ comparison, record })))
    .sort(
      (left, right) =>
        left.record.id.localeCompare(right.record.id) ||
        left.comparison.localeCompare(right.comparison),
    ),
)
let changeStatistics = $derived(
  selectSnapshotChangeStats(statistics, resourceType, primary, variant),
)
let loading = $derived(
  baselineLoading ||
    states.some(state => state.pending && !state.pending.ready && !failures[state.key]),
)
let failure = $derived(states.some(state => failures[state.key]))
let hasBaseline = $derived(inputs.some(input => input.fromSnapshot))
let copy = $derived(sourceRecordChangesCopy[locale])
$effect(() => {
  for (const { key, offset, result } of states) {
    if (!result) continue
    const incomingIds = new Set(result.records.map(record => record.id))
    pages = {
      ...untrack(() => pages),
      [key]:
        offset === 0
          ? result.records
          : [
              ...untrack(() => pages[key] ?? []).filter(
                row => !incomingIds.has(row.id),
              ),
              ...result.records,
            ],
    }
  }
})
$effect(() => {
  let cancelled = false
  failures = {}
  for (const { key, pending } of states) {
    if (pending)
      void pending.catch(() => {
        if (!cancelled) failures[key] = true
      })
  }
  return () => {
    cancelled = true
  }
})
function loadMore() {
  for (const { key, pending, result } of states) {
    if (pending?.ready && result?.nextOffset != null) offsets[key] = result.nextOffset
  }
}
let hasMore = $derived(
  states.some(state => state.pending?.ready && state.result?.nextOffset != null),
)
let overview = $derived(
  changeStatistics.length
    ? createReleaseStatsPresentation({
        stats: changeStatistics,
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
      if (entries.some(entry => entry.isIntersecting)) loadMore()
    },
    { rootMargin: '300px 0px' },
  )
  observer.observe(node)
  return { destroy: () => observer.disconnect() }
}
</script>
<section class="space-y-2" aria-label={copy.changes} aria-busy={loading}>
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
  {#each rows as { comparison, record } (`${comparison}:${record.id}`)}
    <RecordChange {...record} {diff} {locale} />
  {/each}
  {#if failure}
    <p class="text-body-md text-error" role="alert">{copy.error}</p>
    <button
      type="button"
      class="rounded border border-outline-variant px-4 py-2 text-label-sm"
      onclick={() => {
        for (const { key, pending } of states) {
          if (!failures[key]) continue
          failures[key] = false
          void pending?.refresh().catch(() => {
            failures[key] = true
          })
        }
      }}
    >
      {copy.retry}
    </button>
  {/if}
  {#if loading}
    <LoadingRows label={copy.loading} />
  {:else if !hasBaseline && !rows.length}
    <p class="text-body-md text-foreground-alt" role="status">{copy.noBaseline}</p>
  {:else if !rows.length && !failure}
    <EmptyState label={copy.empty} />
  {/if}
  {#if hasMore}
    {#key JSON.stringify(offsets)}
      <div use:observeEnd class="h-px" aria-hidden="true"></div>
    {/key}
  {/if}
</section>
