<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import type { JsonFieldChange } from '@repo/core/jsonFieldDiff'
import { Tooltip } from 'bits-ui'
import Overview from '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsOverviewSection.svelte'
import { createReleaseStatsPresentation } from '#lib/bits/pages/docs/components/releaseStats/releaseStatsPresentation.js'
import type {
  ReleaseStatsCopy,
  ReleaseStat,
} from '#lib/bits/pages/docs/components/releaseStats/releaseStats.types.js'
import BackToTop from './sourceRecordChangesBackToTop.svelte'
import LoadingRows from './sourceRecordChangesSkeleton.svelte'
import RecordChange from './sourceRecordChange.svelte'
import {
  sourceRecordChangesCopy,
  type SourceChangeType,
} from './sourceRecordChanges.copy'
type Change = {
  sourceRecordId: string
  type: SourceChangeType
  before: unknown
  after: unknown
  fields: JsonFieldChange[]
}
type ResponsePage = { records: Change[]; nextCursor: string | null }
let {
  stats,
  family,
  fromRelease,
  toRelease,
  resourceType,
  type,
  onTypeChange,
  locale,
  presentation,
  diff = true,
}: {
  stats?: ReleaseStat[]
  presentation: ReleaseStatsCopy
  diff?: boolean
  family: string
  fromRelease?: string
  toRelease: string
  resourceType: string
  type?: SourceChangeType
  onTypeChange: (type?: SourceChangeType) => void
  locale: keyof typeof sourceRecordChangesCopy
} = $props()
let records = $state<Change[]>([])
let nextCursor = $state<string | null>(null)
let loading = $state(false)
let error = $state(false)
let unavailable = $state(false)
let controller: AbortController | undefined
const copy = $derived(sourceRecordChangesCopy[locale])
const overview = $derived(
  createReleaseStatsPresentation({
    stats,
    resourceType,
    isFirstRelease: !fromRelease,
    locale,
    copy: presentation,
  }).overview,
)
const knownEmpty = $derived.by(() => {
  if (!overview?.churn || overview.churn.unavailable) return false
  const metrics = overview.churn.metrics.filter(metric =>
    type ? metric.key === type : metric.key !== 'unchanged',
  )
  return (
    metrics.length > 0 &&
    metrics.every(metric => metric.formattedValue !== '—' && metric.value === 0)
  )
})
const requestUrl = $derived.by(() => {
  const url = new URL(
    `${(PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '')}/${family}/v0.1/sources/changes`,
  )
  url.searchParams.set('fromRelease', fromRelease ?? '')
  url.searchParams.set('toRelease', toRelease)
  url.searchParams.set('resourceType', resourceType)
  if (type) url.searchParams.set('type', type)
  return url.href
})

async function load(base: string, signal: AbortSignal, cursor: string | null) {
  loading = true
  error = false
  try {
    let page: ResponsePage
    let received = 0
    do {
      const url = new URL(base)
      url.searchParams.set('limit', String(25 - received))
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await fetch(url, { signal })
      if (signal.aborted) return
      if (response.status === 404 || response.status === 409) {
        unavailable = true
        return
      }
      if (!response.ok) throw new Error('Source changes unavailable')
      page = (await response.json()) as ResponsePage
      if (signal.aborted) return
      records = [...records, ...page.records]
      received += page.records.length
      cursor = page.nextCursor
      nextCursor = cursor
    } while (received < 25 && cursor)
  } catch {
    if (!signal.aborted) error = true
  } finally {
    if (!signal.aborted) loading = false
  }
}
function loadMore() {
  if (
    loading ||
    error ||
    unavailable ||
    !nextCursor ||
    !controller ||
    controller.signal.aborted
  )
    return
  void load(requestUrl, controller.signal, nextCursor)
}

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

$effect(() => {
  const base = requestUrl
  const pending = new AbortController()
  controller = pending
  records = []
  nextCursor = null
  unavailable = false
  error = false
  if (!fromRelease || !family || !toRelease) {
    unavailable = true
    loading = false
    return () => pending.abort()
  }
  if (knownEmpty) loading = false
  else void load(base, pending.signal, null)
  return () => pending.abort()
})
</script>

<BackToTop label={copy.backToTop} />
<section class="space-y-2" aria-label={copy.diff} aria-busy={loading}>
  {#if overview}
    <Tooltip.Provider delayDuration={200}>
      <Overview
        {overview}
        labels={presentation.labels}
        onChangeSelect={fromRelease && family ? onTypeChange : undefined}
        selectedType={type}
      />
    </Tooltip.Provider>
  {/if}
  {#each records as record (record.sourceRecordId)}
    <RecordChange
      id={record.sourceRecordId}
      type={record.type}
      fields={record.fields}
      before={record.before}
      after={record.after}
      {diff}
      {locale}
    />
  {/each}
  {#if !fromRelease}
    <p class="text-body-md text-foreground-alt" role="status">{copy.noBaseline}</p>
  {:else if knownEmpty}
    <p class="text-body-md text-foreground-alt" role="status">{copy.empty}</p>
  {:else if unavailable}
    <p class="text-body-md text-foreground-alt" role="status">{copy.unavailable}</p>
  {:else if error}
    <p class="text-body-md text-error" role="alert">{copy.error}</p>
  {:else if loading}
    <LoadingRows label={copy.loading} />
  {:else if !records.length}
    <p class="text-body-md text-foreground-alt" role="status">{copy.empty}</p>
  {/if}
  {#if !knownEmpty && !loading && !unavailable && error}
    <button
      type="button"
      class="rounded border border-outline-variant px-4 py-2 text-label-sm hover:bg-surface-container disabled:opacity-50"
      disabled={loading}
      onclick={() => controller && void load(requestUrl, controller.signal, nextCursor)}
    >
      {copy.retry}
    </button>
  {:else if !knownEmpty && !loading && !unavailable && nextCursor}
    <div use:observeEnd class="h-px" aria-hidden="true"></div>
  {/if}
</section>
